import { prisma } from '../lib/prisma.js';
import { onConsultationCompleted } from './workflowOrchestrationService.js';
import { initScheduleWorkflow, getScheduleProgress, SCHEDULE_STEPS, STEP_LABELS } from './schedulePendingService.js';
import {
  getProcedureReadiness,
  getConsumptionPlanPreview,
  resolveProcedureConsumptions,
  startProcedureClinical as startProcedure,
  applyProcedureConsumption,
  completeProcedureClinical,
  bookProcedureFromWorkflow as bookProcedureCore,
} from './clinicalProcedureService.js';
import { getActiveTreatmentSlip, getTreatmentPlanProgress } from './treatmentPlanService.js';

export {
  getProcedureReadiness,
  startProcedure,
  applyProcedureConsumption,
  completeProcedureClinical,
};

export const CLINICAL_STEPS = [
  { key: 'REGISTERED', label: 'Registration', action: 'view' },
  { key: 'APPOINTMENT', label: 'Appointment', action: 'book_appt' },
  { key: 'CONSULTATION', label: 'Consultation', action: 'consult' },
  { key: 'THERAPIST', label: 'Therapist & Photos', action: 'therapist' },
  { key: 'DOCTOR', label: 'Doctor Review', action: 'doctor' },
  { key: 'PROCEDURE', label: 'Procedure', action: 'procedure' },
  { key: 'PHARMACY', label: 'Pharmacy Medicines', action: 'pharmacy' },
  { key: 'BILLING', label: 'Billing', action: 'bill' },
  { key: 'PAYMENT', label: 'Payment', action: 'pay' },
  { key: 'FOLLOW_UP', label: 'Follow-up / Rebook', action: 'followup' },
];

const STEPS = CLINICAL_STEPS;

async function resolveScheduleProgress(customerId, consultationId) {
  if (consultationId) {
    const scoped = await getScheduleProgress(customerId, consultationId);
    if (scoped.steps.length) return scoped;
  }
  const all = await getScheduleProgress(customerId, null);
  if (all.steps.length) return all;
  const any = await prisma.schedulePendingStep.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' },
  });
  const completed = any.filter((s) => s.status === 'COMPLETED').length;
  return {
    steps: any,
    completed,
    total: SCHEDULE_STEPS.length,
    percent: Math.round((completed / SCHEDULE_STEPS.length) * 100),
  };
}

export async function getConsumptionPlan(procedureId) {
  const preview = await getConsumptionPlanPreview(procedureId);
  return preview.items || [];
}

export async function getClinicalWorkflow(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      appointments: { orderBy: { scheduledAt: 'desc' }, take: 1 },
      consultations: { orderBy: { createdAt: 'desc' }, take: 1 },
      procedures: { orderBy: { scheduledAt: 'desc' }, take: 3, include: { treatment: true, bill: true } },
      bills: { orderBy: { billDate: 'desc' }, take: 1 },
      scheduleSteps: { where: { status: 'PENDING' } },
      treatmentSlips: { orderBy: { createdAt: 'desc' }, take: 1 },
      trichoscanTests: { orderBy: { testedAt: 'desc' }, take: 1 },
    },
  });
  if (!customer) return null;

  const activeProcedure = customer.procedures.find((p) => p.status !== 'CANCELLED' && !p.billId)
    || customer.procedures[0];
  const latestBill = customer.bills[0];
  const latestAppt = customer.appointments[0];
  const latestConsultation = customer.consultations[0];

  const scheduleProgress = await resolveScheduleProgress(customerId, latestConsultation?.id);

  const scheduleStatus = {};
  for (const step of SCHEDULE_STEPS) {
    scheduleStatus[step] = scheduleProgress.steps.find((s) => s.step === step)?.status || 'PENDING';
  }

  const [procedureReadiness, consumptionPreview, consultants, treatments] = await Promise.all([
    activeProcedure ? getProcedureReadiness(activeProcedure.id).catch(() => null) : null,
    activeProcedure ? getConsumptionPlanPreview(activeProcedure.id) : { items: [] },
    prisma.user.findMany({
      where: { role: { code: { in: ['THERAPIST', 'CONSULTANT', 'BRANCH_MANAGER'] } }, isActive: true },
      orderBy: { firstName: 'asc' },
    }),
    prisma.treatment.findMany({
      where: { isActive: true, category: customer.category },
      orderBy: { name: 'asc' },
    }),
  ]);

  let latestTreatmentSlip = customer.treatmentSlips[0] || null;
  if (latestTreatmentSlip?.treatments) {
    try {
      latestTreatmentSlip = { ...latestTreatmentSlip, parsedTreatments: JSON.parse(latestTreatmentSlip.treatments) };
    } catch {
      latestTreatmentSlip = { ...latestTreatmentSlip, parsedTreatments: [] };
    }
  }

  const activeTreatmentSlip = await getActiveTreatmentSlip(customerId);
  const slipForPlan = activeTreatmentSlip || latestTreatmentSlip;
  let treatmentPlan = null;
  if (slipForPlan) {
    try {
      treatmentPlan = await getTreatmentPlanProgress(slipForPlan.id);
    } catch {
      treatmentPlan = null;
    }
  }

  const done = new Set(['REGISTERED']);
  if (latestAppt) done.add('APPOINTMENT');
  if (customer.consultations.some((c) => c.status === 'COMPLETED')) done.add('CONSULTATION');

  const therapistDone = ['BEFORE_PHOTO', 'AFTER_PHOTO'].every(
    (s) => scheduleStatus[s] === 'COMPLETED',
  );
  if (therapistDone || scheduleProgress.completed >= 4) done.add('THERAPIST');

  const doctorDone = scheduleStatus.REGULAR_CONSULTATION === 'COMPLETED'
    || customer.consultations.some((c) => c.type === 'REGULAR' && c.status === 'COMPLETED')
    || customer.consultations.some((c) => c.type === 'FOLLOW_UP' && c.status === 'COMPLETED');
  if (doctorDone) done.add('DOCTOR');

  if (customer.procedures.some((p) => p.status === 'COMPLETED' || p.billId)) done.add('PROCEDURE');

  const pharmacyDone = activeProcedure?.pharmacyBillId
    || !consumptionPreview.items?.length
    || customer.procedures.some((p) => p.pharmacyBillId);
  if (pharmacyDone) done.add('PHARMACY');

  if (latestBill) done.add('BILLING');
  if (latestBill && (latestBill.balanceAmount <= 0 || latestBill.status === 'PAID')) done.add('PAYMENT');

  const pendingTreatmentFu = await prisma.followUp.findFirst({
    where: { customerId, type: 'TREATMENT', status: 'PENDING' },
  });
  if (!pendingTreatmentFu && (treatmentPlan?.remaining === 0 || !treatmentPlan?.nextSessionNo)) {
    done.add('FOLLOW_UP');
  } else if (latestAppt && latestBill?.status === 'PAID' && !pendingTreatmentFu) {
    done.add('FOLLOW_UP');
  }

  const steps = STEPS.map((s) => {
    const urls = {
      REGISTERED: `/customer/${customerId}`,
      APPOINTMENT: `/appointments/create?customerId=${customerId}`,
      CONSULTATION: `/clinical/workflow/${customerId}#consultation`,
      THERAPIST: `/customer/schedule-pending/${customerId}`,
      DOCTOR: `/customer/consultations?customerId=${customerId}`,
      PROCEDURE: activeProcedure
        ? `/appointments/procedures/${activeProcedure.id}`
        : `/appointments/procedures/book?customerId=${customerId}`,
      PHARMACY: activeProcedure?.pharmacyBillId
        ? `/billing/${activeProcedure.pharmacyBillId}`
        : activeProcedure
          ? `/appointments/procedures/${activeProcedure.id}#pharmacy`
          : `/billing/pharmacy?customerId=${customerId}`,
      BILLING: activeProcedure && !activeProcedure.billId
        ? `/billing/create?customerId=${customerId}&procedureId=${activeProcedure.id}`
        : `/billing/create?customerId=${customerId}`,
      PAYMENT: latestBill ? `/billing/${latestBill.id}` : `/billing/create?customerId=${customerId}`,
      FOLLOW_UP: `/call-center/follow-ups/next-sitting?customerId=${customerId}`,
    };
    return {
      ...s,
      done: done.has(s.key),
      url: urls[s.key],
    };
  });

  const next = steps.find((s) => !s.done);
  return {
    customer,
    steps,
    nextStep: next,
    activeProcedure,
    latestBill,
    latestAppt,
    latestConsultation,
    scheduleProgress,
    scheduleWorkflow: {
      steps: SCHEDULE_STEPS.map((key) => ({
        key,
        label: STEP_LABELS[key],
        status: scheduleStatus[key] || 'PENDING',
        done: scheduleStatus[key] === 'COMPLETED',
      })),
      progress: scheduleProgress,
      consultationId: latestConsultation?.id || null,
      url: `/customer/schedule-pending/${customerId}`,
    },
    latestTreatmentSlip,
    activeTreatmentSlip,
    treatmentPlan,
    latestTrichoscan: customer.trichoscanTests[0] || null,
    procedureReadiness,
    consumptionPlan: consumptionPreview.items || [],
    consumptionPreview,
    consultants,
    treatments,
    progress: Math.round((steps.filter((s) => s.done).length / steps.length) * 100),
  };
}

export async function syncConsultationWithClinicalWorkflow(customerId, consultationId) {
  const existing = await prisma.schedulePendingStep.findFirst({
    where: {
      customerId,
      ...(consultationId ? { consultationId } : { consultationId: null }),
    },
  });
  if (!existing) {
    await initScheduleWorkflow(customerId, consultationId || null);
  }
}

export async function runConsultStep({
  customerId,
  consultantId,
  chiefComplaint,
  diagnosis,
  notes,
  recommendations,
  type,
}) {
  const cid = consultantId || (await prisma.user.findFirst({ where: { role: { code: 'CONSULTANT' } } }))?.id;
  if (!cid) throw new Error('No consultant available for consultation');

  let consultation = await prisma.consultation.findFirst({
    where: { customerId, status: { in: ['PENDING', 'COMPLETED'] } },
    orderBy: { createdAt: 'desc' },
  });

  const consultData = {
    chiefComplaint: chiefComplaint || null,
    diagnosis: diagnosis || null,
    notes: notes || null,
    recommendations: recommendations || null,
    type: type || 'INITIAL',
    status: 'COMPLETED',
    consultantId: cid,
  };

  if (consultation) {
    consultation = await prisma.consultation.update({
      where: { id: consultation.id },
      data: consultData,
    });
  } else {
    consultation = await prisma.consultation.create({
      data: { customerId, ...consultData },
    });
    await initScheduleWorkflow(customerId, consultation.id);
  }

  await syncConsultationWithClinicalWorkflow(customerId, consultation.id);
  await onConsultationCompleted({ customerId, consultantId: cid, consultationId: consultation.id });

  return getClinicalWorkflow(customerId);
}

export async function bookProcedureFromWorkflow({
  customerId,
  treatmentId,
  scheduledAt,
  appointmentId,
  performerId,
  userId,
}) {
  const procedure = await bookProcedureCore({
    customerId,
    userId: performerId || userId,
    treatmentId,
    scheduledAt,
    performerId,
  });
  if (appointmentId && !procedure.appointmentId) {
    await prisma.procedure.update({
      where: { id: procedure.id },
      data: { appointmentId },
    });
  }
  return { procedure, workflow: await getClinicalWorkflow(customerId) };
}

/** @deprecated Use completeProcedureClinical */
export async function completeProcedureForBilling(procedureId, userId, opts = {}) {
  return completeProcedureClinical(procedureId, userId);
}

export async function getProcedureBillPrefill(procedureId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: { customer: true, treatment: true, appointment: true },
  });
  if (!procedure) return null;
  if (procedure.billId) {
    return { redirect: `/billing/${procedure.billId}`, alreadyBilled: true };
  }

  const items = [];
  if (procedure.treatment) {
    items.push({
      itemType: 'TREATMENT',
      itemCode: procedure.treatment.code,
      itemName: procedure.treatment.name,
      quantity: 1,
      unitPrice: procedure.treatment.basePrice,
      taxRate: 18,
    });
  }

  const consumptions = await prisma.clinicalConsumption.findMany({
    where: { procedureId },
    include: { product: true },
  });

  if (!procedure.pharmacyBillId) {
    for (const c of consumptions) {
      if (!c.product) continue;
      items.push({
        itemType: 'PRODUCT',
        itemCode: c.product.sku,
        itemName: c.product.name,
        quantity: c.quantity,
        unitPrice: c.product.mrp || c.product.costPrice || 0,
        taxRate: c.product.taxRate ?? 18,
      });
    }
  }

  if (!consumptions.length && !procedure.pharmacyBillId) {
    const latestSlip = await prisma.treatmentSlip.findFirst({
      where: { customerId: procedure.customerId },
      orderBy: { createdAt: 'desc' },
    });
    const slipTreatments = latestSlip?.treatments ? JSON.parse(latestSlip.treatments) : [];
    const plan = await resolveProcedureConsumptions(procedure, slipTreatments);
    for (const row of plan) {
      if (!row.product) continue;
      items.push({
        itemType: 'PRODUCT',
        itemCode: row.product.sku,
        itemName: row.product.name,
        quantity: row.quantity,
        unitPrice: row.product.mrp || row.product.costPrice || 0,
        taxRate: row.product.taxRate ?? 18,
      });
    }
  }

  if (!items.length) {
    const fallback = await prisma.treatment.findFirst({ where: { isActive: true } });
    if (fallback) {
      items.push({
        itemType: 'TREATMENT',
        itemCode: fallback.code,
        itemName: fallback.name,
        quantity: 1,
        unitPrice: fallback.basePrice,
        taxRate: 18,
      });
    }
  }

  return {
    customerId: procedure.customerId,
    procedureId: procedure.id,
    customer: procedure.customer,
    items,
    notes: `Procedure ${procedure.procedureNo}`,
  };
}

export async function linkBillToProcedure(billId, procedureId) {
  return prisma.procedure.update({
    where: { id: procedureId },
    data: { billId, status: 'COMPLETED' },
  });
}
