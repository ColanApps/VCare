import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';

export async function createCustomerVisit({ customerId, branchId, consultantId, visitType, sessionNo, treatmentNotes, createdById }) {
  const visitNo = await generateNumber('VIS', 'customerVisit', 'visitNo');
  return prisma.customerVisit.create({
    data: {
      visitNo,
      customerId,
      branchId,
      consultantId: consultantId || null,
      visitType: visitType || 'TREATMENT',
      sessionNo: parseInt(sessionNo, 10) || 1,
      treatmentNotes,
      createdById,
    },
    include: { customer: true, branch: true },
  });
}

export async function addTreatmentFeedback({ visitId, customerId, rating, feedback, filePath, createdById }) {
  return prisma.treatmentFeedback.upsert({
    where: { visitId },
    create: { visitId, customerId, rating: rating ? parseInt(rating, 10) : null, feedback, filePath, createdById },
    update: { rating: rating ? parseInt(rating, 10) : null, feedback, filePath },
  });
}

export async function createCustomerTest({ customerId, type, testData, findings, recommendations, performedById }) {
  const testNo = await generateNumber(type === 'DSA' ? 'DSA' : 'HMA', 'customerTest', 'testNo');
  return prisma.customerTest.create({
    data: {
      testNo,
      customerId,
      type,
      status: 'COMPLETED',
      testData: testData ? JSON.stringify(testData) : null,
      findings,
      recommendations,
      performedById,
    },
    include: { customer: true },
  });
}

export async function getCustomerTreatmentSummary(customerId) {
  const [visits, tests, feedbacks] = await Promise.all([
    prisma.customerVisit.findMany({
      where: { customerId },
      include: {
        feedback: true,
        branch: true,
        procedure: { include: { treatmentSlip: true, treatment: true } },
      },
      orderBy: { visitedAt: 'desc' },
    }),
    prisma.customerTest.findMany({ where: { customerId }, orderBy: { testedAt: 'desc' } }),
    prisma.treatmentFeedback.findMany({ where: { customerId }, orderBy: { submittedAt: 'desc' } }),
  ]);
  return { visits, tests, feedbacks };
}
