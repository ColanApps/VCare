import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from '../utils/dateHelpers.js';
import { getConsultantIncentiveReport } from './incentiveService.js';
import { getLedgerDaySummary, postDayCloseJournal } from './ledgerService.js';

function dayRange(date) {
  const d = date ? new Date(date) : new Date();
  return { from: startOfDay(d), to: endOfDay(d) };
}

export async function getArAging(branchFilter = {}) {
  const bills = await prisma.bill.findMany({
    where: {
      ...branchFilter,
      balanceAmount: { gt: 0 },
      status: { in: ['PENDING', 'PARTIAL'] },
    },
    include: { customer: true, branch: true },
    orderBy: { billDate: 'asc' },
  });

  const now = Date.now();
  const buckets = { current: [], d30: [], d60: [], d90: [], d90plus: [] };

  for (const b of bills) {
    const days = Math.floor((now - new Date(b.billDate).getTime()) / 86400000);
    const row = {
      id: b.id,
      billNo: b.billNo,
      customer: `${b.customer.firstName} ${b.customer.lastName}`,
      customerId: b.customerId,
      branch: b.branch.name,
      billDate: b.billDate,
      total: b.totalAmount,
      balance: b.balanceAmount,
      days,
    };
    if (days <= 30) buckets.current.push(row);
    else if (days <= 60) buckets.d30.push(row);
    else if (days <= 90) buckets.d60.push(row);
    else if (days <= 120) buckets.d90.push(row);
    else buckets.d90plus.push(row);
  }

  const summary = {
    current: sumBalance(buckets.current),
    d30: sumBalance(buckets.d30),
    d60: sumBalance(buckets.d60),
    d90: sumBalance(buckets.d90),
    d90plus: sumBalance(buckets.d90plus),
    total: bills.reduce((s, b) => s + b.balanceAmount, 0),
    count: bills.length,
  };

  return { buckets, summary, bills: bills.slice(0, 100).map((b) => ({
    ...b,
    days: Math.floor((now - new Date(b.billDate).getTime()) / 86400000),
  })) };
}

function sumBalance(rows) {
  return rows.reduce((s, r) => s + r.balance, 0);
}

export async function getDayClosePreview(branchId, dateStr) {
  const { from, to } = dayRange(dateStr);
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new Error('Branch not found');

  const billWhere = { branchId, billDate: { gte: from, lte: to }, status: { notIn: ['CANCELLED', 'DRAFT'] } };

  const [bills, payments, deposits, petty, refunds, existing] = await Promise.all([
    prisma.bill.aggregate({ where: billWhere, _sum: { totalAmount: true, taxAmount: true } }),
    prisma.payment.findMany({
      where: { bill: billWhere, paymentDate: { gte: from, lte: to } },
      select: { amount: true, paymentMode: true },
    }),
    prisma.cashDeposit.aggregate({
      where: { branchId, createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.pettyCash.aggregate({
      where: { branchId, createdAt: { gte: from, lte: to }, status: 'APPROVED' },
      _sum: { amount: true },
    }),
    prisma.creditNote.aggregate({
      where: { bill: billWhere, createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.dayClose.findUnique({
      where: { branchId_closeDate: { branchId, closeDate: from } },
      include: { closedBy: true, approvedBy: true },
    }),
  ]);

  const modeTotals = { CASH: 0, CARD: 0, UPI: 0, BANK_TRANSFER: 0, CHEQUE: 0, OTHER: 0 };
  let collectionsTotal = 0;
  for (const p of payments) {
    collectionsTotal += p.amount;
    const mode = modeTotals[p.paymentMode] != null ? p.paymentMode : 'OTHER';
    modeTotals[mode] = (modeTotals[mode] || 0) + p.amount;
  }

  const dtr = await prisma.dTRRecord.findFirst({
    where: { branchId, recordDate: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
  });

  const systemCash = modeTotals.CASH || 0;
  const billsTotal = bills._sum.totalAmount || 0;
  const gstOutput = bills._sum.taxAmount || 0;

  const ledgerSummary = await getLedgerDaySummary(branchId, from, to).catch(() => null);

  return {
    branch,
    closeDate: from,
    billsTotal,
    collectionsTotal,
    cashCollections: modeTotals.CASH || 0,
    cardCollections: modeTotals.CARD || 0,
    upiCollections: modeTotals.UPI || 0,
    bankCollections: (modeTotals.BANK_TRANSFER || 0) + (modeTotals.CHEQUE || 0),
    depositsTotal: deposits._sum.amount || 0,
    pettyTotal: petty._sum.amount || 0,
    refundsTotal: refunds._sum.amount || 0,
    systemCash,
    gstOutput,
    dtr,
    existing,
    paymentCount: payments.length,
    variance: existing?.variance ?? 0,
    ledgerSummary,
  };
}

export async function submitDayClose({ branchId, closeDate, physicalCash, notes, userId }) {
  const preview = await getDayClosePreview(branchId, closeDate);
  const { from } = dayRange(closeDate);
  const physical = parseFloat(physicalCash) || 0;
  const variance = physical - preview.systemCash;
  const closeNo = await generateNumber('DC', 'dayClose', 'closeNo');

  const data = {
    closeNo,
    branchId,
    closeDate: from,
    billsTotal: preview.billsTotal,
    collectionsTotal: preview.collectionsTotal,
    cashCollections: preview.cashCollections,
    cardCollections: preview.cardCollections,
    upiCollections: preview.upiCollections,
    bankCollections: preview.bankCollections,
    depositsTotal: preview.depositsTotal,
    pettyTotal: preview.pettyTotal,
    refundsTotal: preview.refundsTotal,
    systemCash: preview.systemCash,
    physicalCash: physical,
    variance,
    gstOutput: preview.gstOutput,
    dtrId: preview.dtr?.id || null,
    status: 'SUBMITTED',
    notes,
    closedById: userId,
  };

  if (preview.existing) {
    return prisma.dayClose.update({
      where: { id: preview.existing.id },
      data,
      include: { branch: true, closedBy: true },
    });
  }

  return prisma.dayClose.create({
    data,
    include: { branch: true, closedBy: true },
  });
}

export async function approveDayClose(dayCloseId, userId, { roleCode } = {}) {
  const existing = await prisma.dayClose.findUnique({ where: { id: dayCloseId } });
  if (!existing) throw new Error('Day close not found');
  if (existing.status !== 'SUBMITTED') throw new Error('Only submitted day close can be approved');
  if (existing.closedById === userId && roleCode !== 'SUPER_ADMIN') {
    throw new Error('Approver cannot be the same user who submitted the day close');
  }

  const dayClose = await prisma.dayClose.update({
    where: { id: dayCloseId },
    data: {
      status: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
    },
    include: { branch: true, closedBy: true, approvedBy: true },
  });
  await ensureDtrForDayClose(dayClose);
  return dayClose;
}

export async function lockDayClose(dayCloseId, userId, { roleCode } = {}) {
  const existing = await prisma.dayClose.findUnique({ where: { id: dayCloseId } });
  if (!existing) throw new Error('Day close not found');
  if (existing.status !== 'APPROVED') throw new Error('Day close must be approved before locking');
  if (existing.closedById === userId && roleCode !== 'SUPER_ADMIN') {
    throw new Error('Locker cannot be the same user who submitted the day close');
  }

  const dayClose = await prisma.dayClose.update({
    where: { id: dayCloseId },
    data: { status: 'LOCKED', approvedById: userId, approvedAt: new Date() },
    include: { branch: true, closedBy: true },
  });
  await ensureDtrForDayClose(dayClose);
  await postDayCloseJournal({ dayClose, userId }).catch(() => {});
  return dayClose;
}

export async function getFinanceHubSummary(branchFilter = {}) {
  const today = dayRange();
  const month = { from: startOfMonth(), to: endOfMonth() };

  const [todayBills, monthBills, outstanding, pendingClose, pendingIncentives] = await Promise.all([
    prisma.bill.aggregate({
      where: { ...branchFilter, billDate: { gte: today.from, lte: today.to }, status: { notIn: ['CANCELLED'] } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.bill.aggregate({
      where: { ...branchFilter, billDate: { gte: month.from, lte: month.to }, status: { notIn: ['CANCELLED'] } },
      _sum: { totalAmount: true, taxAmount: true },
    }),
    prisma.bill.aggregate({
      where: { ...branchFilter, balanceAmount: { gt: 0 } },
      _sum: { balanceAmount: true },
      _count: true,
    }),
    prisma.dayClose.count({ where: { ...branchFilter, status: 'SUBMITTED' } }),
    prisma.incentivePayout.count({ where: { status: 'CALCULATED' } }),
  ]);

  const recentCloses = await prisma.dayClose.findMany({
    where: branchFilter,
    include: { branch: true, closedBy: true },
    orderBy: { closeDate: 'desc' },
    take: 10,
  });

  return {
    todaySales: todayBills._sum.totalAmount || 0,
    todayCollections: todayBills._sum.paidAmount || 0,
    todayBillCount: todayBills._count,
    monthSales: monthBills._sum.totalAmount || 0,
    monthGst: monthBills._sum.taxAmount || 0,
    arTotal: outstanding._sum.balanceAmount || 0,
    arCount: outstanding._count,
    pendingDayClose: pendingClose,
    pendingIncentives,
    recentCloses,
  };
}

export async function createIncentivePayoutsFromUpload(uploadId) {
  const upload = await prisma.incentiveUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw new Error('Upload not found');

  const report = await getConsultantIncentiveReport(upload.periodMonth, upload.periodYear);
  const consultants = await prisma.user.findMany({
    where: { role: { code: 'CONSULTANT' } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byName = Object.fromEntries(consultants.map((c) => [`${c.firstName} ${c.lastName}`.toLowerCase(), c.id]));

  const payouts = [];
  let total = 0;
  for (const line of report) {
    const cid = byName[(line.consultant || '').toLowerCase()];
    if (!cid || !(line.incentive > 0)) continue;
    const payoutNo = await generateNumber('IP', 'incentivePayout', 'payoutNo');
    const payout = await prisma.incentivePayout.create({
      data: {
        payoutNo,
        uploadId,
        consultantId: cid,
        periodMonth: upload.periodMonth,
        periodYear: upload.periodYear,
        amount: line.incentive,
        status: 'CALCULATED',
      },
      include: { consultant: true },
    });
    payouts.push(payout);
    total += line.incentive;
  }

  await prisma.incentiveUpload.update({
    where: { id: uploadId },
    data: { status: 'CALCULATED', totalAmount: total },
  });

  return { payouts, total };
}

export async function approveIncentivePayout(payoutId, userId) {
  return prisma.incentivePayout.update({
    where: { id: payoutId },
    data: { status: 'APPROVED', approvedById: userId },
    include: { consultant: true },
  });
}

export async function markIncentivePaid(payoutId, paymentRef) {
  const payout = await prisma.incentivePayout.update({
    where: { id: payoutId },
    data: { status: 'PAID', paidAt: new Date(), paymentRef },
    include: { upload: true },
  });

  if (payout.uploadId) {
    const remaining = await prisma.incentivePayout.count({
      where: { uploadId: payout.uploadId, status: { not: 'PAID' } },
    });
    if (remaining === 0) {
      await prisma.incentiveUpload.update({
        where: { id: payout.uploadId },
        data: { status: 'PAID' },
      });
    }
  }
  return payout;
}

export async function getGstExportPack(branchFilter, month, year) {
  const from = new Date(year, month - 1, 1);
  const to = endOfMonth(from);
  const bills = await prisma.bill.findMany({
    where: {
      ...branchFilter,
      billDate: { gte: from, lte: to },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
    },
    include: { customer: true, branch: true, items: true },
    orderBy: { billDate: 'asc' },
  });

  return {
    period: { month, year, from, to },
    bills,
    summary: {
      count: bills.length,
      taxable: bills.reduce((s, b) => s + b.subtotal, 0),
      tax: bills.reduce((s, b) => s + b.taxAmount, 0),
      total: bills.reduce((s, b) => s + b.totalAmount, 0),
    },
  };
}

export async function getReceiptVoucherData(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      bill: {
        include: { customer: true, branch: true, createdBy: true },
      },
    },
  });
  if (!payment) return null;

  const journalEntry = await prisma.journalEntry.findFirst({
    where: { sourceType: 'PAYMENT', sourceId: payment.id },
    include: { lines: { include: { account: true } } },
  });

  return {
    receiptNo: `RCP-${payment.id.slice(-8).toUpperCase()}`,
    payment,
    bill: payment.bill,
    customer: payment.bill.customer,
    branch: payment.bill.branch,
    journalEntry,
  };
}
