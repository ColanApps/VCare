import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { recordClinicalConsumption } from './stockService.js';
import { onProcedureCompleted } from './workflowOrchestrationService.js';
import { getActiveTreatmentSlip, attachProcedureToSlip } from './treatmentPlanService.js';

export const PROCEDURE_STATES = ['BOOKED', 'IN_PROGRESS', 'COMPLETED'];

const PRE_PHOTO_TYPES = ['PROCEDURE_PRE', 'BEFORE'];
const POST_PHOTO_TYPES = ['PROCEDURE_POST', 'PROCEDURE_POST_HT', 'AFTER'];

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function collectProcedureTypeKeys(procedure, slipTreatments = []) {
  const keys = new Set();
  if (procedure.treatment?.code) keys.add(normalizeKey(procedure.treatment.code));
  if (procedure.treatment?.name) keys.add(normalizeKey(procedure.treatment.name));
  if (procedure.appointment?.type) keys.add(normalizeKey(procedure.appointment.type));
  if (procedure.appointment?.category) keys.add(normalizeKey(procedure.appointment.category));

  for (const entry of slipTreatments) {
    if (typeof entry === 'string') {
      keys.add(normalizeKey(entry));
    } else if (entry && typeof entry === 'object') {
      if (entry.code) keys.add(normalizeKey(entry.code));
      if (entry.name) keys.add(normalizeKey(entry.name));
      if (entry.treatmentCode) keys.add(normalizeKey(entry.treatmentCode));
      if (entry.treatmentName) keys.add(normalizeKey(entry.treatmentName));
    }
  }
  return keys;
}

function matchesProcedureType(masterType, typeKeys) {
  const normalized = normalizeKey(masterType);
  if (!normalized) return false;
  if (typeKeys.has(normalized)) return true;
  for (const key of typeKeys) {
    if (key.includes(normalized) || normalized.includes(key)) return true;
  }
  return false;
}

export async function resolveProcedureConsumptions(procedure, slipTreatments = []) {
  const typeKeys = collectProcedureTypeKeys(procedure, slipTreatments);
  if (!typeKeys.size) return [];

  const masters = await prisma.procedureConsumption.findMany({
    where: { isActive: true },
    include: { product: true },
  });

  return masters.filter((row) => matchesProcedureType(row.procedureType, typeKeys));
}

export async function getConsumptionPlanPreview(procedureId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: { treatment: true, appointment: true, customer: true },
  });
  if (!procedure) return { items: [], procedureTypeKeys: [] };

  const latestSlip = await prisma.treatmentSlip.findFirst({
    where: { customerId: procedure.customerId },
    orderBy: { createdAt: 'desc' },
  });
  const slipTreatments = latestSlip?.treatments ? JSON.parse(latestSlip.treatments) : [];
  const typeKeys = [...collectProcedureTypeKeys(procedure, slipTreatments)];
  const items = await resolveProcedureConsumptions(procedure, slipTreatments);

  return {
    procedureId,
    procedureTypeKeys: typeKeys,
    items: items.map((row) => ({
      id: row.id,
      procedureType: row.procedureType,
      productId: row.productId,
      productName: row.product?.name,
      productCode: row.product?.code,
      quantity: row.quantity,
    })),
  };
}

async function hasCustomerPhoto(customerId, types) {
  const photo = await prisma.customerPhoto.findFirst({
    where: { customerId, type: { in: types } },
    orderBy: { takenAt: 'desc' },
  });
  return Boolean(photo);
}

async function isConsumptionApplied(procedure) {
  if (procedure.consumptionApplied) return true;
  const count = await prisma.clinicalConsumption.count({ where: { procedureId: procedure.id } });
  return count > 0;
}

export async function getProcedureReadiness(procedureId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: { treatment: true, appointment: true },
  });
  if (!procedure) {
    return {
      consent: false,
      prePhoto: false,
      postPhoto: false,
      consumptionApplied: false,
      canComplete: false,
      blockers: ['Procedure not found'],
    };
  }

  const [prePhoto, postPhoto, consumptionApplied] = await Promise.all([
    hasCustomerPhoto(procedure.customerId, PRE_PHOTO_TYPES),
    hasCustomerPhoto(procedure.customerId, POST_PHOTO_TYPES),
    isConsumptionApplied(procedure),
  ]);

  const consent = procedure.consentGiven;
  const blockers = [];
  if (!consent) blockers.push('Patient consent required');
  if (!prePhoto) blockers.push('Pre-procedure photo required');
  if (!postPhoto) blockers.push('Post-procedure photo required');

  const plan = await getConsumptionPlanPreview(procedureId);
  if (plan.items.length > 0 && !consumptionApplied) {
    blockers.push('Clinical consumption not applied');
  }

  const { getProcedureKitShortfalls } = await import('./kitShortfallService.js');
  const kitShortfalls = await getProcedureKitShortfalls(procedureId).catch(() => []);
  for (const s of kitShortfalls) {
    blockers.push(`Kit shortfall: ${s.productName} (need ${s.shortfall} more)`);
  }

  return {
    consent,
    prePhoto,
    postPhoto,
    consumptionApplied,
    canComplete: blockers.length === 0,
    blockers,
    status: procedure.status,
    consumptionPlanCount: plan.items.length,
  };
}

function assertConsent(procedure) {
  if (!procedure.consentGiven) {
    throw new Error('Patient consent is required before starting or completing the procedure');
  }
}

export async function startProcedureClinical(procedureId, userId) {
  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
  if (!procedure) throw new Error('Procedure not found');
  if (procedure.status === 'CANCELLED') throw new Error('Cannot start a cancelled procedure');
  if (procedure.status === 'COMPLETED') throw new Error('Procedure already completed');
  if (procedure.status === 'IN_PROGRESS') return procedure;

  assertConsent(procedure);

  return prisma.procedure.update({
    where: { id: procedureId },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), performerId: procedure.performerId || userId },
    include: { treatment: true, appointment: true, customer: true },
  });
}

export async function applyProcedureConsumption(procedureId, userId, branchId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: { treatment: true, appointment: true, customer: true },
  });
  if (!procedure) throw new Error('Procedure not found');
  if (procedure.consumptionApplied) {
    return { procedure, alreadyApplied: true, consumptions: [] };
  }

  const existing = await prisma.clinicalConsumption.findMany({ where: { procedureId } });
  if (existing.length) {
    await prisma.procedure.update({
      where: { id: procedureId },
      data: { consumptionApplied: true },
    });
    return { procedure: { ...procedure, consumptionApplied: true }, alreadyApplied: true, consumptions: existing };
  }

  assertConsent(procedure);

  const latestSlip = await prisma.treatmentSlip.findFirst({
    where: { customerId: procedure.customerId },
    orderBy: { createdAt: 'desc' },
  });
  const slipTreatments = latestSlip?.treatments ? JSON.parse(latestSlip.treatments) : [];
  const plan = await resolveProcedureConsumptions(procedure, slipTreatments);

  if (!plan.length) {
    throw new Error('No procedure consumption master found for this treatment type');
  }

  const resolvedBranchId = branchId || procedure.branchId || procedure.customer.branchId;
  const consumptions = [];

  for (const row of plan) {
    const record = await recordClinicalConsumption({
      branchId: resolvedBranchId,
      productId: row.productId,
      quantity: row.quantity,
      customerId: procedure.customerId,
      procedureId: procedure.id,
      notes: `Procedure ${procedure.procedureNo} — ${row.procedureType}`,
      consumedById: userId,
    });
    consumptions.push(record);
  }

  const updated = await prisma.procedure.update({
    where: { id: procedureId },
    data: { consumptionApplied: true },
    include: { treatment: true, appointment: true, customer: true },
  });

  return { procedure: updated, alreadyApplied: false, consumptions };
}

export async function bookProcedureFromWorkflow({
  customerId,
  userId,
  treatmentId,
  scheduledAt,
  performerId,
  notes,
}) {
  const [customer, latestAppt, latestSlip] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.appointment.findFirst({
      where: { customerId },
      orderBy: { scheduledAt: 'desc' },
    }),
    prisma.treatmentSlip.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!customer) throw new Error('Customer not found');

  let resolvedTreatmentId = treatmentId || null;
  if (!resolvedTreatmentId && latestSlip?.treatments) {
    const treatments = JSON.parse(latestSlip.treatments);
    const first = treatments[0];
    if (first) {
      const where = typeof first === 'string'
        ? { OR: [{ code: first }, { name: first }], isActive: true }
        : {
            OR: [
              first.id ? { id: first.id } : undefined,
              first.code ? { code: first.code } : undefined,
              first.name ? { name: first.name } : undefined,
              first.treatmentCode ? { code: first.treatmentCode } : undefined,
              first.treatmentName ? { name: first.treatmentName } : undefined,
            ].filter(Boolean),
            isActive: true,
          };
      const match = await prisma.treatment.findFirst({ where });
      resolvedTreatmentId = match?.id || null;
    }
  }
  if (!resolvedTreatmentId && latestAppt?.treatmentId) {
    resolvedTreatmentId = latestAppt.treatmentId;
  }

  const procedureNo = await generateNumber('PRC', 'procedure', 'procedureNo');
  const branchId = latestAppt?.branchId || customer.branchId;
  const when = scheduledAt ? new Date(scheduledAt) : new Date();

  const { resolveProcedurePerformer } = await import('./therapistAssignmentService.js');
  const assignedPerformer = await resolveProcedurePerformer({
    branchId,
    treatmentId: resolvedTreatmentId,
    scheduledAt: when,
    performerId,
  });

  const procedure = await prisma.procedure.create({
    data: {
      procedureNo,
      customerId,
      branchId,
      treatmentId: resolvedTreatmentId,
      appointmentId: latestAppt?.id || null,
      performerId: assignedPerformer || performerId || userId,
      scheduledAt: when,
      notes: notes || (latestSlip ? `From treatment slip ${latestSlip.slipNo}` : null),
      status: 'BOOKED',
    },
    include: { treatment: true, appointment: true, customer: true },
  });

  const { ensureProcedureConsentPdf } = await import('./consentFormService.js');
  await ensureProcedureConsentPdf(procedure.id).catch(() => {});

  const activeSlip = latestSlip?.status === 'ACTIVE'
    ? latestSlip
    : await getActiveTreatmentSlip(customerId);
  if (activeSlip) {
    try {
      return await attachProcedureToSlip(procedure.id, activeSlip.id);
    } catch {
      return procedure;
    }
  }

  return procedure;
}

export async function completeProcedureClinical(procedureId, userId, { notes } = {}) {
  if (notes) {
    await prisma.procedure.update({ where: { id: procedureId }, data: { notes } });
  }
  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
  if (!procedure) throw new Error('Procedure not found');
  if (procedure.status === 'CANCELLED') throw new Error('Cannot complete a cancelled procedure');

  assertConsent(procedure);

  const readiness = await getProcedureReadiness(procedureId);
  if (!readiness.canComplete) {
    throw new Error(`Cannot complete procedure: ${readiness.blockers.join('; ')}`);
  }

  if (procedure.status === 'BOOKED') {
    await startProcedureClinical(procedureId, userId);
  }

  const completed = await onProcedureCompleted({ procedureId, userId });

  const { createPharmacyBillFromProcedure } = await import('./pharmacyService.js');
  const pharmacyBill = await createPharmacyBillFromProcedure(procedureId, userId).catch(() => null);
  if (pharmacyBill) {
    const { onPharmacyBillCreated } = await import('./workflowOrchestrationService.js');
    await onPharmacyBillCreated({ bill: pharmacyBill, procedureId, userId }).catch(() => {});
  }

  return {
    procedure: completed,
    pharmacyBill,
    billUrl: `/billing/create?customerId=${completed.customerId}&procedureId=${completed.id}`,
    pharmacyBillUrl: pharmacyBill ? `/billing/${pharmacyBill.id}` : null,
  };
}
