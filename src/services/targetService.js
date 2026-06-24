import { prisma } from '../lib/prisma.js';
import { startOfMonth, endOfMonth } from 'date-fns';

export async function getBranchSalesForPeriod(branchId, from, to) {
  const sales = await prisma.bill.aggregate({
    where: {
      branchId,
      billDate: { gte: from, lte: to },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
    },
    _sum: { totalAmount: true },
  });
  return sales._sum.totalAmount || 0;
}

export async function enrichTargetsWithAchievement(targets, from, to) {
  return Promise.all(
    targets.map(async (t) => {
      const achieved = await getBranchSalesForPeriod(t.branchId, from, to);
      return {
        ...t,
        achieved,
        progress: t.target > 0 ? Math.min(100, (achieved / t.target) * 100) : 0,
      };
    })
  );
}

export async function getBranchesWithMonthStats(month, year) {
  const from = startOfMonth(new Date(year, month - 1));
  const to = endOfMonth(new Date(year, month - 1));

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: {
      targets: { where: { month, year } },
      _count: { select: { customers: true, appointments: true, bills: true } },
    },
  });

  return Promise.all(
    branches.map(async (b) => {
      const achieved = await getBranchSalesForPeriod(b.id, from, to);
      const target = b.targets[0]?.target || 0;
      return {
        ...b,
        monthTarget: target,
        monthAchieved: achieved,
        monthProgress: target > 0 ? Math.min(100, (achieved / target) * 100) : 0,
      };
    })
  );
}
