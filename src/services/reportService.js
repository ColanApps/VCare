import { prisma } from '../lib/prisma.js';
import { differenceInDays } from 'date-fns';

export async function getBranchComparison(monthStart, monthEnd) {
  const branches = await prisma.branch.findMany({
    where: { isActive: true, type: { not: 'WAREHOUSE' } },
    include: { zone: true },
    orderBy: { name: 'asc' },
  });

  const rows = await Promise.all(
    branches.map(async (branch) => {
      const [sales, bills, customers, targets] = await Promise.all([
        prisma.bill.aggregate({
          where: { branchId: branch.id, billDate: { gte: monthStart, lte: monthEnd }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
          _sum: { totalAmount: true, paidAmount: true, taxAmount: true },
          _count: true,
        }),
        prisma.bill.count({ where: { branchId: branch.id, billDate: { gte: monthStart, lte: monthEnd }, status: 'PAID' } }),
        prisma.customer.count({ where: { branchId: branch.id, registeredAt: { gte: monthStart, lte: monthEnd } } }),
        prisma.locationTarget.findFirst({
          where: { branchId: branch.id, month: monthStart.getMonth() + 1, year: monthStart.getFullYear() },
        }),
      ]);

      const revenue = sales._sum.totalAmount || 0;
      const target = targets?.target || 0;

      return {
        branch,
        revenue,
        collected: sales._sum.paidAmount || 0,
        tax: sales._sum.taxAmount || 0,
        billCount: sales._count,
        paidBills: bills,
        newCustomers: customers,
        target,
        achievement: target > 0 ? (revenue / target) * 100 : 0,
      };
    })
  );

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      collected: acc.collected + r.collected,
      billCount: acc.billCount + r.billCount,
      newCustomers: acc.newCustomers + r.newCustomers,
    }),
    { revenue: 0, collected: 0, billCount: 0, newCustomers: 0 }
  );

  return { rows: rows.sort((a, b) => b.revenue - a.revenue), totals };
}

export async function getInventoryAging(branchFilter = {}) {
  const where = {};
  if (branchFilter.branchId) where.branchId = branchFilter.branchId;

  const stocks = await prisma.stock.findMany({
    where: { ...where, quantity: { gt: 0 } },
    include: { product: true, branch: true },
    orderBy: { updatedAt: 'asc' },
  });

  const now = new Date();
  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };

  for (const stock of stocks) {
    const ageDays = differenceInDays(now, stock.updatedAt);
    const bucket = ageDays > 90 ? '90+' : ageDays > 60 ? '61-90' : ageDays > 30 ? '31-60' : '0-30';
    const row = { ...stock, ageDays, bucket, value: stock.quantity * (stock.product.mrp || 0) };
    buckets[bucket].push(row);
  }

  const summary = Object.entries(buckets).map(([bucket, items]) => ({
    bucket,
    lines: items.length,
    units: items.reduce((s, i) => s + i.quantity, 0),
    value: items.reduce((s, i) => s + i.value, 0),
  }));

  return { buckets, summary, allItems: stocks.length };
}

export async function getConsultantDetail(consultantId, monthStart, monthEnd) {
  const consultant = await prisma.user.findUnique({
    where: { id: consultantId },
    include: { branch: true, designation: true, role: true },
  });
  if (!consultant) return null;

  const [bills, appointments, consultations, target] = await Promise.all([
    prisma.bill.findMany({
      where: {
        createdById: consultantId,
        billDate: { gte: monthStart, lte: monthEnd },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      include: { customer: true, items: true },
      orderBy: { billDate: 'desc' },
    }),
    prisma.appointment.findMany({
      where: { consultantId, scheduledAt: { gte: monthStart, lte: monthEnd } },
      include: { customer: true },
      orderBy: { scheduledAt: 'desc' },
    }),
    prisma.consultation.findMany({
      where: { consultantId, consultedAt: { gte: monthStart, lte: monthEnd } },
      include: { customer: true },
      orderBy: { consultedAt: 'desc' },
    }),
    prisma.consultantTarget.findFirst({
      where: { consultantId, month: monthStart.getMonth() + 1, year: monthStart.getFullYear() },
    }),
  ]);

  const revenue = bills.reduce((s, b) => s + b.totalAmount, 0);
  const collected = bills.reduce((s, b) => s + b.paidAmount, 0);
  const treatmentBreakdown = {};
  for (const bill of bills) {
    for (const item of bill.items) {
      const key = item.itemName;
      treatmentBreakdown[key] = (treatmentBreakdown[key] || 0) + item.totalAmount;
    }
  }

  return {
    consultant,
    bills,
    appointments,
    consultations,
    target: target?.target || 0,
    achieved: target?.achieved || revenue,
    revenue,
    collected,
    billCount: bills.length,
    appointmentCount: appointments.length,
    consultationCount: consultations.length,
    treatmentBreakdown: Object.entries(treatmentBreakdown)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function getPendingAdvanceReport(branchFilter, from, to) {
  const advances = await prisma.advanceReceipt.findMany({
    where: {
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
      status: 'ACTIVE',
      balanceAmount: { gt: 0 },
      createdAt: { gte: from, lte: to },
    },
    include: { customer: true, branch: true },
    orderBy: { createdAt: 'desc' },
  });
  const total = advances.reduce((s, a) => s + a.balanceAmount, 0);
  return { advances, total };
}

export async function getLoanReport(from, to) {
  const loans = await prisma.loanAccount.findMany({
    where: { createdAt: { gte: from, lte: to } },
    include: {
      customer: true,
      bill: true,
      installments: { orderBy: { installmentNo: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const summary = {
    count: loans.length,
    principal: loans.reduce((s, l) => s + l.principal, 0),
    outstanding: loans.reduce((s, l) => s + (l.totalPayable - l.paidAmount), 0),
  };
  return { loans, summary };
}

export async function getProductServiceSales(from, to, branchFilter) {
  const bills = await prisma.bill.findMany({
    where: {
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
      billDate: { gte: from, lte: to },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
    },
    include: { items: true },
  });
  const breakdown = {};
  for (const bill of bills) {
    for (const item of bill.items) {
      const key = `${item.itemType}::${item.itemName}`;
      if (!breakdown[key]) breakdown[key] = { itemType: item.itemType, itemName: item.itemName, quantity: 0, revenue: 0 };
      breakdown[key].quantity += item.quantity;
      breakdown[key].revenue += item.totalAmount;
    }
  }
  return Object.values(breakdown).sort((a, b) => b.revenue - a.revenue);
}

export async function getDiscontinuedCustomers(branchFilter) {
  return prisma.customer.findMany({
    where: { ...branchFilter, status: { in: ['INACTIVE', 'DISCONTINUED'] } },
    include: { branch: true, _count: { select: { bills: true, appointments: true } } },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getRefundCreditReport(from, to, branchFilter) {
  const creditNotes = await prisma.creditNote.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(branchFilter.branchId ? { bill: { branchId: branchFilter.branchId } } : {}),
    },
    include: { bill: { include: { customer: true, branch: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const total = creditNotes.reduce((s, c) => s + c.amount, 0);
  return { creditNotes, total };
}

export async function getCollectionReport(from, to, branchFilter) {
  const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
  const rows = await Promise.all(
    branches.map(async (b) => {
      if (branchFilter.branchId && b.id !== branchFilter.branchId) return null;
      const agg = await prisma.bill.aggregate({
        where: { branchId: b.id, billDate: { gte: from, lte: to }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true, paidAmount: true },
      });
      return { branch: b, billed: agg._sum.totalAmount || 0, collected: agg._sum.paidAmount || 0 };
    })
  );
  return rows.filter(Boolean).sort((a, b) => b.collected - a.collected);
}

export async function getAppointmentVisitReport(from, to, branchFilter) {
  const [appointments, visits] = await Promise.all([
    prisma.appointment.groupBy({
      by: ['status'],
      where: { ...branchFilter, scheduledAt: { gte: from, lte: to } },
      _count: true,
    }),
    prisma.customerVisit.count({
      where: {
        visitedAt: { gte: from, lte: to },
        ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
      },
    }),
  ]);
  return { appointments, visits };
}

export async function getNotJoinedReport(from, to, branchFilter) {
  const customers = await prisma.customer.findMany({
    where: {
      ...branchFilter,
      registeredAt: { gte: from, lte: to },
      bills: { none: {} },
    },
    include: { branch: true, followUps: { where: { type: 'NOT_JOINED' }, take: 3 } },
    orderBy: { registeredAt: 'desc' },
  });
  return customers;
}
