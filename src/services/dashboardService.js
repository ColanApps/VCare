import { prisma } from '../lib/prisma.js';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';

export async function getExecutiveDashboard(branchFilter = {}) {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const [
    totalCustomers,
    newCustomersMonth,
    appointmentsToday,
    appointmentsMonth,
    billsMonth,
    revenueMonth,
    revenueToday,
    pendingIndents,
    openTickets,
    pendingIOU,
  ] = await Promise.all([
    prisma.customer.count({ where: { ...branchFilter, status: 'ACTIVE' } }),
    prisma.customer.count({
      where: { ...branchFilter, registeredAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.appointment.count({
      where: { ...branchFilter, scheduledAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.appointment.count({
      where: { ...branchFilter, scheduledAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.bill.count({
      where: { ...branchFilter, billDate: { gte: monthStart, lte: monthEnd }, status: { not: 'CANCELLED' } },
    }),
    prisma.bill.aggregate({
      where: { ...branchFilter, billDate: { gte: monthStart, lte: monthEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.bill.aggregate({
      where: { ...branchFilter, billDate: { gte: dayStart, lte: dayEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      _sum: { totalAmount: true },
    }),
    prisma.indent.count({ where: { ...branchFilter, status: 'PENDING' } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.iOURequest.count({ where: { status: 'PENDING' } }),
  ]);

  const salesTrend = [];
  for (let i = 6; i >= 0; i--) {
    const date = subDays(today, i);
    const agg = await prisma.bill.aggregate({
      where: {
        ...branchFilter,
        billDate: { gte: startOfDay(date), lte: endOfDay(date) },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    });
    salesTrend.push({
      date: date.toISOString().split('T')[0],
      label: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
      revenue: agg._sum.totalAmount || 0,
      bills: agg._count,
    });
  }

  const recentAppointments = await prisma.appointment.findMany({
    where: { ...branchFilter, scheduledAt: { gte: dayStart } },
    include: { customer: true, consultant: true, branch: true },
    orderBy: { scheduledAt: 'asc' },
    take: 8,
  });

  const branchPerformance = await prisma.branch.findMany({
    where: { isActive: true },
    include: {
      targets: { where: { month: today.getMonth() + 1, year: today.getFullYear() } },
      _count: { select: { customers: true, appointments: true } },
    },
    take: 6,
  });

  const branchSales = await Promise.all(
    branchPerformance.map(async (b) => {
      const sales = await prisma.bill.aggregate({
        where: { branchId: b.id, billDate: { gte: monthStart, lte: monthEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
      });
      const target = b.targets[0]?.target || 0;
      const achieved = sales._sum.totalAmount || 0;
      return {
        ...b,
        achieved,
        target,
        progress: target > 0 ? Math.min(100, (achieved / target) * 100) : 0,
      };
    })
  );

  return {
    kpis: {
      totalCustomers,
      newCustomersMonth,
      appointmentsToday,
      appointmentsMonth,
      billsMonth,
      revenueMonth: revenueMonth._sum.totalAmount || 0,
      collectedMonth: revenueMonth._sum.paidAmount || 0,
      revenueToday: revenueToday._sum.totalAmount || 0,
      pendingIndents,
      openTickets,
      pendingIOU,
    },
    salesTrend,
    recentAppointments,
    branchPerformance: branchSales,
  };
}

export async function getInflowSales(branchFilter = {}, from, to) {
  const monthStart = from || startOfMonth(new Date());
  const monthEnd = to || endOfMonth(new Date());

  const [existing, newCustomers, hair, skin] = await Promise.all([
    prisma.bill.aggregate({
      where: {
        ...branchFilter,
        billDate: { gte: monthStart, lte: monthEnd },
        customer: { registeredAt: { lt: monthStart } },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.bill.aggregate({
      where: {
        ...branchFilter,
        billDate: { gte: monthStart, lte: monthEnd },
        customer: { registeredAt: { gte: monthStart } },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.bill.aggregate({
      where: {
        ...branchFilter,
        billDate: { gte: monthStart, lte: monthEnd },
        customer: { category: 'HAIR' },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalAmount: true },
    }),
    prisma.bill.aggregate({
      where: {
        ...branchFilter,
        billDate: { gte: monthStart, lte: monthEnd },
        customer: { category: 'SKIN' },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    existing: { revenue: existing._sum.totalAmount || 0, count: existing._count },
    new: { revenue: newCustomers._sum.totalAmount || 0, count: newCustomers._count },
    hair: hair._sum.totalAmount || 0,
    skin: skin._sum.totalAmount || 0,
    total: (existing._sum.totalAmount || 0) + (newCustomers._sum.totalAmount || 0),
  };
}
