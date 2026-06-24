import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';

export const SCHEDULE_STEPS = [
  'CONSULTATION',
  'BEFORE_PHOTO',
  'TRICHOSCAN',
  'TREATMENT_SLIP',
  'REGULAR_CONSULTATION',
  'AFTER_PHOTO',
];

export const STEP_LABELS = {
  CONSULTATION: 'Consultation Form',
  BEFORE_PHOTO: 'Before Photo Upload',
  TRICHOSCAN: 'Tricho Scan Test',
  TREATMENT_SLIP: 'Treatment Slip',
  REGULAR_CONSULTATION: 'Regular Consultation',
  AFTER_PHOTO: 'After Photo Upload',
};

export async function initScheduleWorkflow(customerId, consultationId) {
  for (const step of SCHEDULE_STEPS) {
    await prisma.schedulePendingStep.upsert({
      where: { customerId_consultationId_step: { customerId, consultationId: consultationId || null, step } },
      create: { customerId, consultationId: consultationId || null, step, status: step === 'CONSULTATION' ? 'PENDING' : 'PENDING' },
      update: {},
    });
  }
}

export async function getScheduleProgress(customerId, consultationId) {
  const steps = await prisma.schedulePendingStep.findMany({
    where: { customerId, ...(consultationId ? { consultationId } : {}) },
    orderBy: { createdAt: 'asc' },
  });

  const completed = steps.filter((s) => s.status === 'COMPLETED').length;
  return { steps, completed, total: SCHEDULE_STEPS.length, percent: Math.round((completed / SCHEDULE_STEPS.length) * 100) };
}

export async function maybeFinalizeWorkflow(customerId, consultationId) {
  const progress = await getScheduleProgress(customerId, consultationId);
  if (progress.completed < progress.total) return false;

  if (consultationId) {
    await prisma.consultation.updateMany({
      where: { id: consultationId, status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });
  }

  return true;
}

export async function completeScheduleStep({ customerId, consultationId, step, userId, notes }) {
  const result = await prisma.schedulePendingStep.upsert({
    where: { customerId_consultationId_step: { customerId, consultationId: consultationId || null, step } },
    create: {
      customerId,
      consultationId: consultationId || null,
      step,
      status: 'COMPLETED',
      completedAt: new Date(),
      completedById: userId,
      notes,
    },
    update: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedById: userId,
      notes,
    },
  });

  await maybeFinalizeWorkflow(customerId, consultationId);
  return result;
}

export async function createTreatmentSlip({ customerId, consultationId, treatments, sessions, notes, userId, sessionCadence, cadenceDays }) {
  const slipNo = await generateNumber('TSL', 'treatmentSlip', 'slipNo');
  const slip = await prisma.treatmentSlip.create({
    data: {
      slipNo,
      customerId,
      consultationId: consultationId || null,
      treatments: JSON.stringify(treatments),
      sessions: sessions || 1,
      sessionCadence: sessionCadence || 'WEEKLY',
      cadenceDays: cadenceDays ? parseInt(cadenceDays, 10) : null,
      notes,
      createdById: userId,
    },
  });

  await completeScheduleStep({ customerId, consultationId, step: 'TREATMENT_SLIP', userId });
  return slip;
}

export async function createTrichoscanTest({ customerId, consultationId, data, userId }) {
  const testNo = await generateNumber('TRI', 'trichoscanTest', 'testNo');
  const test = await prisma.trichoscanTest.create({
    data: {
      testNo,
      customerId,
      consultationId: consultationId || null,
      hairDensity: data.hairDensity ? parseFloat(data.hairDensity) : null,
      hairDiameter: data.hairDiameter ? parseFloat(data.hairDiameter) : null,
      follicleCount: data.follicleCount ? parseInt(data.follicleCount, 10) : null,
      scalpCondition: data.scalpCondition,
      findings: data.findings,
      recommendations: data.recommendations,
      performedById: userId,
    },
  });

  await completeScheduleStep({ customerId, consultationId, step: 'TRICHOSCAN', userId });
  return test;
}

export async function getPendingScheduleCustomers(branchFilter = {}) {
  return prisma.customer.findMany({
    where: {
      ...branchFilter,
      scheduleSteps: { some: { status: 'PENDING' } },
    },
    include: {
      branch: true,
      consultations: { where: { status: 'PENDING' }, take: 1, orderBy: { createdAt: 'desc' } },
      scheduleSteps: true,
      photos: { take: 4 },
      treatmentSlips: { take: 1, orderBy: { createdAt: 'desc' } },
      trichoscanTests: { take: 1, orderBy: { testedAt: 'desc' } },
    },
    take: 50,
  });
}
