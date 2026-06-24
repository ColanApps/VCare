import { prisma } from '../lib/prisma.js';
import { createVisitFromProcedure, maybeCompleteTreatmentSlip, computeNextSessionDueDate, scheduleNextSessionFollowUp, getTreatmentPlanProgress } from './treatmentPlanService.js';

/** Cross-role workflow hooks — chain CC → Consultant → Accounts */

export async function onAppointmentBooked({ appointment, customer, bookedById, source = 'WALK_IN' }) {
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CONFIRMED', source },
  });

  const pendingFus = await prisma.followUp.findMany({
    where: { customerId: customer.id, status: 'PENDING', type: { in: ['NOT_JOINED', 'REGULAR', 'TREATMENT'] } },
    take: 5,
  });
  for (const fu of pendingFus) {
    await prisma.followUp.update({
      where: { id: fu.id },
      data: { status: 'COMPLETED', completedAt: new Date(), feedback: `Appointment ${appointment.appointmentNo} booked` },
    });
  }

  if (bookedById) {
    await prisma.auditLog.create({
      data: {
        userId: bookedById,
        action: 'APPOINTMENT_BOOKED',
        module: 'WORKFLOW',
        entityType: 'Appointment',
        entityId: appointment.id,
        details: JSON.stringify({ customerId: customer.id, source }),
      },
    }).catch(() => {});
  }

  return appointment;
}

export async function onConsultationCompleted({ customerId, consultantId, consultationId }) {
  if (consultationId) {
    return prisma.consultation.update({
      where: { id: consultationId },
      data: { status: 'COMPLETED', consultedAt: new Date() },
    });
  }

  const existing = await prisma.consultation.findFirst({
    where: { customerId, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  const cid = consultantId || (await prisma.user.findFirst({ where: { role: { code: 'CONSULTANT' } } }))?.id;
  if (!cid) throw new Error('No consultant available for consultation');

  return prisma.consultation.create({
    data: {
      customerId,
      consultantId: cid,
      notes: 'Consultation completed via clinical workflow',
      status: 'COMPLETED',
    },
  });
}

export async function onProcedureCompleted({ procedureId, userId }) {
  const procedure = await prisma.procedure.update({
    where: { id: procedureId },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: { customer: true, treatment: true, appointment: true },
  });

  if (procedure.appointmentId) {
    await prisma.appointment.update({
      where: { id: procedure.appointmentId },
      data: { status: 'COMPLETED' },
    });
  }

  await createVisitFromProcedure(procedure, userId).catch(() => {});

  if (procedure.treatmentSlipId) {
    await maybeCompleteTreatmentSlip(procedure.treatmentSlipId).catch(() => {});
    await scheduleNextSessionFollowUp({
      slipId: procedure.treatmentSlipId,
      completedProcedureId: procedureId,
      userId,
    }).catch(() => {});
  }

  await prisma.followUp.create({
    data: {
      customerId: procedure.customerId,
      type: 'PROCEDURE_COMPLETED',
      status: 'PENDING',
      scheduledAt: new Date(),
      assignedTo: userId,
    },
  }).catch(() => {});

  return procedure;
}

export async function onBillCreated({ bill, procedureId, userId }) {
  if (procedureId) {
    await prisma.procedure.update({
      where: { id: procedureId },
      data: { billId: bill.id, status: 'COMPLETED' },
    });
  }

  await prisma.followUp.updateMany({
    where: { customerId: bill.customerId, type: 'PROCEDURE_COMPLETED', status: 'PENDING' },
    data: { status: 'COMPLETED', completedAt: new Date(), feedback: `Billed ${bill.billNo}` },
  });

  if (bill.balanceAmount > 0) {
    const existing = await prisma.followUp.findFirst({
      where: { customerId: bill.customerId, type: 'PENDING_ADVANCE', status: 'PENDING' },
    });
    if (!existing) {
      await prisma.followUp.create({
        data: {
          customerId: bill.customerId,
          type: 'PENDING_ADVANCE',
          status: 'PENDING',
          scheduledAt: new Date(),
          feedback: `Balance ${bill.balanceAmount} on ${bill.billNo}`,
        },
      });
    }
  }

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'BILL_CREATED',
        module: 'WORKFLOW',
        entityType: 'Bill',
        entityId: bill.id,
        details: JSON.stringify({ procedureId, balance: bill.balanceAmount }),
      },
    }).catch(() => {});
  }

  return bill;
}

/** Fire bill-created + embedded payment workflow hooks after ledger sync. */
export async function notifyBillWorkflow({ bill, procedureId = null, userId }) {
  await onBillCreated({ bill, procedureId, userId });
  const freshBill = await prisma.bill.findUnique({
    where: { id: bill.id },
    include: { payments: true },
  });
  for (const payment of freshBill?.payments || []) {
    await onPaymentRecorded({ bill: freshBill, payment, userId });
  }
  return freshBill;
}

export async function onPharmacyBillCreated({ bill, procedureId, userId }) {
  if (procedureId) {
    await prisma.procedure.update({
      where: { id: procedureId },
      data: { pharmacyBillId: bill.id },
    }).catch(() => {});
  }

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PHARMACY_BILL_CREATED',
        module: 'WORKFLOW',
        entityType: 'Bill',
        entityId: bill.id,
        details: JSON.stringify({ procedureId, billNo: bill.billNo }),
      },
    }).catch(() => {});
  }

  return bill;
}

export async function onPaymentRecorded({ bill, payment, userId }) {
  if (bill.balanceAmount <= 0) {
    await prisma.followUp.updateMany({
      where: { customerId: bill.customerId, type: 'PENDING_ADVANCE', status: 'PENDING' },
      data: { status: 'COMPLETED', completedAt: new Date(), feedback: `Paid in full ${bill.billNo}` },
    });
    await scheduleRebookAfterPayment({ bill, userId }).catch(() => {});
  }

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PAYMENT_RECORDED',
        module: 'WORKFLOW',
        entityType: 'Payment',
        entityId: payment.id,
        details: JSON.stringify({ billNo: bill.billNo, amount: payment.amount }),
      },
    }).catch(() => {});
  }
}

async function scheduleRebookAfterPayment({ bill, userId }) {
  const slip = await prisma.treatmentSlip.findFirst({
    where: { customerId: bill.customerId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!slip) return null;

  const progress = await getTreatmentPlanProgress(slip.id);
  if (!progress.nextSessionNo || progress.remaining <= 0) return null;

  const dueAt = slip.nextSessionDueAt || await computeNextSessionDueDate(slip.id);

  const existing = await prisma.followUp.findFirst({
    where: {
      customerId: bill.customerId,
      type: 'TREATMENT',
      status: 'PENDING',
      feedback: { contains: `Session ${progress.nextSessionNo}` },
    },
  });
  if (existing) return existing;

  return prisma.followUp.create({
    data: {
      customerId: bill.customerId,
      type: 'TREATMENT',
      status: 'PENDING',
      scheduledAt: dueAt,
      assignedTo: userId,
      feedback: `Session ${progress.nextSessionNo} of ${progress.totalSessions} — rebook after payment on ${bill.billNo}`,
    },
  });
}

export async function onFollowUpCompleted({ followUpId, feedback, userId }) {
  const fu = await prisma.followUp.update({
    where: { id: followUpId },
    data: { status: 'COMPLETED', completedAt: new Date(), feedback: feedback || 'Completed' },
    include: { customer: true },
  });

  if (fu.type === 'NOT_JOINED' && userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'FOLLOWUP_COMPLETED',
        module: 'CALL_CENTER',
        entityType: 'FollowUp',
        entityId: followUpId,
      },
    }).catch(() => {});
  }
  return fu;
}

export async function createLeadFollowUp(customerId, type = 'NOT_JOINED') {
  return prisma.followUp.create({
    data: {
      customerId,
      type,
      status: 'PENDING',
      scheduledAt: new Date(),
    },
  });
}
