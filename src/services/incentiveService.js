import { prisma } from '../lib/prisma.js';
import { startOfMonth, endOfMonth, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';

const CONSULTANT_INCENTIVE_RATE = 0.02;
const BM_INCENTIVE_RATE = 0.01;
const TARGET_ACHIEVEMENT_THRESHOLD = 100;

export async function getConsultantIncentiveReport(month, year) {
  const from = startOfMonth(new Date(year, month - 1));
  const to = endOfMonth(new Date(year, month - 1));

  const consultants = await prisma.user.findMany({
    where: { role: { code: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } }, isActive: true },
    include: { branch: true, designation: true },
  });

  const rows = await Promise.all(
    consultants.map(async (c) => {
      const [bills, target] = await Promise.all([
        prisma.bill.findMany({
          where: {
            createdById: c.id,
            billDate: { gte: from, lte: to },
            status: { notIn: ['CANCELLED', 'DRAFT'] },
          },
        }),
        prisma.consultantTarget.findFirst({
          where: { consultantId: c.id, month, year },
        }),
      ]);

      const revenue = bills.reduce((s, b) => s + b.totalAmount, 0);
      const targetAmount = target?.target || 0;
      const achievement = targetAmount > 0 ? (revenue / targetAmount) * 100 : 0;
      const excess = Math.max(0, revenue - targetAmount);
      const incentive =
        achievement >= TARGET_ACHIEVEMENT_THRESHOLD ? Math.round(excess * CONSULTANT_INCENTIVE_RATE) : 0;

      return {
        consultant: c,
        revenue,
        target: targetAmount,
        achievement,
        incentive,
        billCount: bills.length,
      };
    })
  );

  return rows.filter((r) => r.revenue > 0 || r.target > 0).sort((a, b) => b.incentive - a.incentive);
}

export async function getBranchManagerIncentiveReport(month, year) {
  const from = startOfMonth(new Date(year, month - 1));
  const to = endOfMonth(new Date(year, month - 1));

  const branches = await prisma.branch.findMany({
    where: { isActive: true, type: { not: 'WAREHOUSE' } },
    include: { targets: { where: { month, year } } },
  });

  const managers = await prisma.user.findMany({
    where: { role: { code: 'BRANCH_MANAGER' }, isActive: true },
    include: { branch: true },
  });

  const rows = await Promise.all(
    branches.map(async (b) => {
      const sales = await prisma.bill.aggregate({
        where: { branchId: b.id, billDate: { gte: from, lte: to }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
      });
      const revenue = sales._sum.totalAmount || 0;
      const target = b.targets[0]?.target || 0;
      const achievement = target > 0 ? (revenue / target) * 100 : 0;
      const manager = managers.find((m) => m.branchId === b.id);
      const incentive =
        achievement >= TARGET_ACHIEVEMENT_THRESHOLD ? Math.round(revenue * BM_INCENTIVE_RATE) : 0;

      return { branch: b, manager, revenue, target, achievement, incentive };
    })
  );

  return rows.sort((a, b) => b.incentive - a.incentive);
}

export async function getDayTargetAchievementReport(month, year, branchFilter = {}) {
  const from = startOfMonth(new Date(year, month - 1));
  const to = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: from, end: to });

  const branches = await prisma.branch.findMany({
    where: {
      isActive: true,
      type: { not: 'WAREHOUSE' },
      ...(branchFilter.branchId ? { id: branchFilter.branchId } : {}),
    },
    include: { targets: { where: { month, year } } },
  });

  const dailyRows = [];
  for (const day of days) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    for (const branch of branches) {
      const monthTarget = branch.targets[0]?.target || 0;
      const dayTarget = monthTarget > 0 ? monthTarget / days.length : 0;
      const sales = await prisma.bill.aggregate({
        where: {
          branchId: branch.id,
          billDate: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
        _sum: { totalAmount: true },
      });
      const achieved = sales._sum.totalAmount || 0;
      dailyRows.push({
        date: day,
        branch,
        dayTarget: Math.round(dayTarget),
        achieved,
        achievement: dayTarget > 0 ? (achieved / dayTarget) * 100 : 0,
      });
    }
  }

  return dailyRows;
}
