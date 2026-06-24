import { prisma } from '../lib/prisma.js';
import { startOfMonth, endOfMonth } from 'date-fns';
import { getConsultantDetail } from './reportService.js';

export async function getCorporateDashboard() {
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const branches = await prisma.branch.findMany({
    where: { isActive: true, type: { not: 'WAREHOUSE' } },
  });

  const branchStats = await Promise.all(
    branches.map(async (b) => {
      const sales = await prisma.bill.aggregate({
        where: { branchId: b.id, billDate: { gte: monthStart, lte: monthEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
        _count: true,
      });
      const target = await prisma.locationTarget.findFirst({
        where: { branchId: b.id, month: monthStart.getMonth() + 1, year: monthStart.getFullYear() },
      });
      return {
        branch: b,
        revenue: sales._sum.totalAmount || 0,
        bills: sales._count,
        target: target?.target || 0,
      };
    })
  );

  const totalRevenue = branchStats.reduce((s, b) => s + b.revenue, 0);
  const totalTarget = branchStats.reduce((s, b) => s + b.target, 0);
  const openTickets = await prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } });
  const pendingIou = await prisma.iOURequest.count({ where: { status: 'PENDING' } });

  return {
    branchStats: branchStats.sort((a, b) => b.revenue - a.revenue),
    totalRevenue,
    totalTarget,
    achievement: totalTarget > 0 ? (totalRevenue / totalTarget) * 100 : 0,
    openTickets,
    pendingIou,
    period: { start: monthStart, end: monthEnd },
  };
}

export async function getAccountsDashboard() {
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const [sales, outstanding, gst, recentPayments, creditNotes, advances] = await Promise.all([
    prisma.bill.aggregate({
      where: { billDate: { gte: monthStart, lte: monthEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      _sum: { totalAmount: true, paidAmount: true, taxAmount: true, balanceAmount: true },
      _count: true,
    }),
    prisma.bill.aggregate({
      where: { balanceAmount: { gt: 0 }, status: { in: ['PENDING', 'PARTIAL'] } },
      _sum: { balanceAmount: true },
      _count: true,
    }),
    prisma.bill.aggregate({
      where: { billDate: { gte: monthStart, lte: monthEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      _sum: { taxAmount: true },
    }),
    prisma.payment.findMany({
      include: { bill: { include: { customer: true } } },
      orderBy: { paymentDate: 'desc' },
      take: 15,
    }),
    prisma.creditNote.findMany({
      include: { bill: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.advanceReceipt.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { balanceAmount: true },
      _count: true,
    }),
  ]);

  return {
    monthBilled: sales._sum.totalAmount || 0,
    monthCollected: sales._sum.paidAmount || 0,
    monthGst: gst._sum.taxAmount || 0,
    billCount: sales._count,
    outstanding: outstanding._sum.balanceAmount || 0,
    outstandingBills: outstanding._count,
    advanceBalance: advances._sum.balanceAmount || 0,
    advanceCount: advances._count,
    recentPayments,
    creditNotes,
    period: { start: monthStart, end: monthEnd },
  };
}

export async function getConsultantDashboard(consultantId) {
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const detail = await getConsultantDetail(consultantId, monthStart, monthEnd);
  const todayAppointments = await prisma.appointment.findMany({
    where: {
      consultantId,
      scheduledAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lte: new Date(new Date().setHours(23, 59, 59, 999)) },
    },
    include: { customer: true },
    orderBy: { scheduledAt: 'asc' },
  });
  const pendingFollowUps = await prisma.followUp.count({
    where: { status: 'PENDING', customer: { consultations: { some: { consultantId } } } },
  });
  return { ...detail, todayAppointments, pendingFollowUps, period: { start: monthStart, end: monthEnd } };
}
