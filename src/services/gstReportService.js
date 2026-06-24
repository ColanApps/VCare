import { prisma } from '../lib/prisma.js';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, startOfDay, endOfDay } from 'date-fns';

function billItemWhere(branchFilter, monthStart, monthEnd, extra = {}) {
  return {
    bill: {
      ...branchFilter,
      billDate: { gte: monthStart, lte: monthEnd },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      ...extra,
    },
  };
}

export async function getGstSummary(branchFilter = {}, monthStart, monthEnd) {
  const items = await prisma.billItem.findMany({
    where: billItemWhere(branchFilter, monthStart, monthEnd),
    include: { bill: { include: { customer: true, branch: true } } },
  });

  const hsnSummary = {};
  for (const item of items) {
    const key = item.itemCode;
    if (!hsnSummary[key]) hsnSummary[key] = { name: item.itemName, type: item.itemType, taxable: 0, tax: 0, total: 0, qty: 0 };
    hsnSummary[key].taxable += item.unitPrice * item.quantity - item.discount;
    hsnSummary[key].tax += item.taxAmount;
    hsnSummary[key].total += item.totalAmount;
    hsnSummary[key].qty += item.quantity;
  }

  return {
    items,
    hsnSummary: Object.entries(hsnSummary).map(([code, data]) => ({ code, ...data })),
    totalTax: items.reduce((s, i) => s + i.taxAmount, 0),
    totalRevenue: items.reduce((s, i) => s + i.totalAmount, 0),
  };
}

export async function getGstB2C(branchFilter, monthStart, monthEnd) {
  const bills = await prisma.bill.findMany({
    where: {
      ...branchFilter,
      billDate: { gte: monthStart, lte: monthEnd },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      source: { in: ['CENTER', 'ONLINE'] },
      billType: { in: ['SERVICE', 'PHARMACY', 'PRODUCT'] },
    },
    include: { customer: true, items: true, branch: true },
    orderBy: { billDate: 'desc' },
  });
  return bills;
}

export async function getGstB2B(branchFilter, monthStart, monthEnd) {
  const bills = await prisma.bill.findMany({
    where: {
      ...branchFilter,
      billDate: { gte: monthStart, lte: monthEnd },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      source: 'B2B',
    },
    include: { customer: true, items: true, branch: true },
    orderBy: { billDate: 'desc' },
  });
  return bills;
}

export async function getGstDayWise(branchFilter, monthStart, monthEnd) {
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const rows = [];

  for (const day of days) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const agg = await prisma.bill.aggregate({
      where: {
        ...branchFilter,
        billDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { subtotal: true, taxAmount: true, totalAmount: true },
      _count: true,
    });
    rows.push({
      date: format(day, 'yyyy-MM-dd'),
      label: format(day, 'dd MMM'),
      bills: agg._count,
      taxable: agg._sum.subtotal || 0,
      tax: agg._sum.taxAmount || 0,
      total: agg._sum.totalAmount || 0,
    });
  }

  return rows;
}
