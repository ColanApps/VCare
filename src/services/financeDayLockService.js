import { prisma } from '../lib/prisma.js';
import { startOfDay, endOfDay } from '../utils/dateHelpers.js';
import { generateNumber } from '../utils/helpers.js';

export async function isDateLocked(branchId, date = new Date()) {
  const from = startOfDay(date);
  const to = endOfDay(date);
  const locked = await prisma.dayClose.findFirst({
    where: {
      branchId,
      closeDate: { gte: from, lte: to },
      status: { in: ['APPROVED', 'LOCKED'] },
    },
  });
  return Boolean(locked);
}

export async function assertDateNotLocked(branchId, date, action = 'post transactions') {
  if (!branchId) return;
  const locked = await isDateLocked(branchId, date);
  if (locked) {
    throw new Error(`This business day is closed. Cannot ${action} for ${startOfDay(date).toLocaleDateString('en-IN')}.`);
  }
}

export async function ensureDtrForDayClose(dayClose) {
  const { from, to } = { from: startOfDay(dayClose.closeDate), to: endOfDay(dayClose.closeDate) };
  let dtr = await prisma.dTRRecord.findFirst({
    where: { branchId: dayClose.branchId, recordDate: { gte: from, lte: to } },
  });
  if (!dtr) {
    const dtrNo = await generateNumber('DTR', 'dTRRecord', 'dtrNo');
    dtr = await prisma.dTRRecord.create({
      data: {
        dtrNo,
        branchId: dayClose.branchId,
        recordDate: from,
        openingCash: 0,
        closingCash: dayClose.physicalCash,
        notes: `Auto from day close ${dayClose.closeNo}`,
        createdById: dayClose.closedById,
      },
    });
    await prisma.dayClose.update({
      where: { id: dayClose.id },
      data: { dtrId: dtr.id },
    });
  } else {
    await prisma.dTRRecord.update({
      where: { id: dtr.id },
      data: { closingCash: dayClose.physicalCash },
    });
  }
  return dtr;
}
