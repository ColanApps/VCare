import { prisma } from '../lib/prisma.js';
import { createCustomerVisit } from './treatmentService.js';
import { addDays, addWeeks, addMonths } from 'date-fns';

export async function getActiveTreatmentSlip(customerId) {
  return prisma.treatmentSlip.findFirst({
    where: { customerId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTreatmentPlanProgress(slipId) {
  const slip = await prisma.treatmentSlip.findUnique({
    where: { id: slipId },
    include: {
      procedures: {
        where: { sessionNo: { not: null } },
        orderBy: { sessionNo: 'asc' },
      },
    },
  });
  if (!slip) throw new Error('Treatment slip not found');

  const totalSessions = slip.sessions;
  const sessionProcedures = slip.procedures.filter((p) => p.sessionNo != null);

  const completedSessions = sessionProcedures.filter((p) => p.status === 'COMPLETED').length;

  let nextSessionNo = null;
  try {
    nextSessionNo = await resolveNextSessionForSlip(slipId);
  } catch {
    nextSessionNo = null;
  }

  const procedures = sessionProcedures.map((p) => ({
    id: p.id,
    sessionNo: p.sessionNo,
    status: p.status,
    procedureNo: p.procedureNo,
    completedAt: p.completedAt,
  }));

  const sessionRows = Array.from({ length: totalSessions }, (_, i) => {
    const sessionNo = i + 1;
    const proc = sessionProcedures.find((p) => p.sessionNo === sessionNo);
    let status = 'PENDING';
    if (proc) status = proc.status === 'COMPLETED' ? 'DONE' : 'BOOKED';
    return {
      sessionNo,
      status,
      procedureId: proc?.id ?? null,
      procedureNo: proc?.procedureNo ?? null,
    };
  });

  const currentSessionNo = nextSessionNo
    ?? (completedSessions >= totalSessions ? totalSessions : completedSessions + 1);

  return {
    slip,
    totalSessions,
    completedSessions,
    nextSessionNo,
    currentSessionNo,
    remaining: Math.max(0, totalSessions - completedSessions),
    procedures,
    sessionRows,
    percent: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
  };
}

export async function resolveNextSessionForSlip(slipId, treatmentId) {
  const slip = await prisma.treatmentSlip.findUnique({
    where: { id: slipId },
    include: {
      procedures: {
        where: { status: { not: 'CANCELLED' }, sessionNo: { not: null } },
      },
    },
  });
  if (!slip) throw new Error('Treatment slip not found');
  if (slip.status !== 'ACTIVE') throw new Error('Treatment slip is not active');

  if (treatmentId) {
    const treatment = await prisma.treatment.findUnique({ where: { id: treatmentId } });
    if (treatment && slip.treatments) {
      try {
        const planned = JSON.parse(slip.treatments);
        const matches = planned.some((entry) => {
          if (typeof entry === 'string') {
            return entry === treatment.code || entry === treatment.name;
          }
          return entry?.id === treatment.id
            || entry?.code === treatment.code
            || entry?.name === treatment.name
            || entry?.treatmentCode === treatment.code
            || entry?.treatmentName === treatment.name;
        });
        if (planned.length && !matches) {
          throw new Error('Treatment is not part of this treatment slip plan');
        }
      } catch (err) {
        if (err.message === 'Treatment is not part of this treatment slip plan') throw err;
      }
    }
  }

  const assignedSessions = new Set(
    slip.procedures.map((p) => p.sessionNo).filter((n) => n != null),
  );

  for (let n = 1; n <= slip.sessions; n += 1) {
    if (!assignedSessions.has(n)) return n;
  }

  throw new Error('Treatment plan sessions exhausted');
}

export async function attachProcedureToSlip(procedureId, slipId) {
  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
  if (!procedure) throw new Error('Procedure not found');

  const sessionNo = await resolveNextSessionForSlip(slipId, procedure.treatmentId || undefined);

  return prisma.procedure.update({
    where: { id: procedureId },
    data: { treatmentSlipId: slipId, sessionNo },
    include: { treatment: true, treatmentSlip: true, customer: true },
  });
}

export async function createVisitFromProcedure(procedure, userId) {
  const full = procedure.treatment
    ? procedure
    : await prisma.procedure.findUnique({
        where: { id: procedure.id },
        include: { treatment: true, customer: true },
      });
  if (!full) throw new Error('Procedure not found');

  if (full.customerVisitId) {
    return prisma.customerVisit.findUnique({ where: { id: full.customerVisitId } });
  }

  const branchId = full.branchId || full.customer?.branchId;
  if (!branchId) throw new Error('Branch required to create treatment visit');

  const treatmentName = full.treatment?.name || 'Treatment';
  const noteParts = [`Session ${full.sessionNo || 1}: ${treatmentName}`];
  if (full.notes) noteParts.push(full.notes);

  const visit = await createCustomerVisit({
    customerId: full.customerId,
    branchId,
    consultantId: full.performerId || null,
    visitType: 'TREATMENT',
    sessionNo: full.sessionNo || 1,
    treatmentNotes: noteParts.join(' — '),
    createdById: userId,
  });

  await prisma.procedure.update({
    where: { id: full.id },
    data: { customerVisitId: visit.id },
  });

  return visit;
}

export async function maybeCompleteTreatmentSlip(slipId) {
  const slip = await prisma.treatmentSlip.findUnique({
    where: { id: slipId },
    include: {
      procedures: {
        where: { status: 'COMPLETED', sessionNo: { not: null } },
      },
    },
  });
  if (!slip || slip.status !== 'ACTIVE') return slip;

  const completedSessionNos = new Set(slip.procedures.map((p) => p.sessionNo));
  const allDone = slip.sessions > 0
    && Array.from({ length: slip.sessions }, (_, i) => i + 1)
      .every((n) => completedSessionNos.has(n));

  if (!allDone) return slip;

  return prisma.treatmentSlip.update({
    where: { id: slipId },
    data: { status: 'COMPLETED' },
  });
}

export function cadenceToDays(slip) {
  if (slip.sessionCadence === 'MONTHLY') return 30;
  if (slip.sessionCadence === 'CUSTOM' && slip.cadenceDays) return slip.cadenceDays;
  return 7;
}

export async function computeNextSessionDueDate(slipId, fromDate = new Date()) {
  const slip = await prisma.treatmentSlip.findUnique({ where: { id: slipId } });
  if (!slip) return addWeeks(fromDate, 1);
  const days = cadenceToDays(slip);
  if (slip.sessionCadence === 'MONTHLY') return addMonths(fromDate, 1);
  return addDays(fromDate, days);
}

export async function scheduleNextSessionFollowUp({ slipId, completedProcedureId, userId }) {
  const slip = await prisma.treatmentSlip.findUnique({ where: { id: slipId } });
  if (!slip || slip.status !== 'ACTIVE') return null;

  const progress = await getTreatmentPlanProgress(slipId);
  if (!progress.nextSessionNo || progress.remaining <= 0) {
    return null;
  }

  const procedure = await prisma.procedure.findUnique({ where: { id: completedProcedureId } });
  const completedAt = procedure?.completedAt || new Date();
  const dueAt = await computeNextSessionDueDate(slipId, completedAt);

  await prisma.treatmentSlip.update({
    where: { id: slipId },
    data: {
      lastSessionCompletedAt: completedAt,
      nextSessionDueAt: dueAt,
    },
  });

  const existing = await prisma.followUp.findFirst({
    where: {
      customerId: slip.customerId,
      type: 'TREATMENT',
      status: 'PENDING',
      feedback: { contains: `Session ${progress.nextSessionNo}` },
    },
  });
  if (existing) {
    return prisma.followUp.update({
      where: { id: existing.id },
      data: { scheduledAt: dueAt },
    });
  }

  return prisma.followUp.create({
    data: {
      customerId: slip.customerId,
      type: 'TREATMENT',
      status: 'PENDING',
      scheduledAt: dueAt,
      assignedTo: userId,
      feedback: `Session ${progress.nextSessionNo} of ${progress.totalSessions} due (${slip.sessionCadence || 'WEEKLY'})`,
    },
  });
}
