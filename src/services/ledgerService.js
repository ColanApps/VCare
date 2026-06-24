import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';

const DEFAULT_ACCOUNTS = [
  { code: '1100', name: 'Cash', accountType: 'ASSET', normalSide: 'DEBIT' },
  { code: '1110', name: 'Bank', accountType: 'ASSET', normalSide: 'DEBIT' },
  { code: '1200', name: 'Accounts Receivable', accountType: 'ASSET', normalSide: 'DEBIT' },
  { code: '2100', name: 'GST Payable', accountType: 'LIABILITY', normalSide: 'CREDIT' },
  { code: '4100', name: 'Service Revenue', accountType: 'REVENUE', normalSide: 'CREDIT' },
  { code: '4200', name: 'Pharmacy Revenue', accountType: 'REVENUE', normalSide: 'CREDIT' },
  { code: '1300', name: 'Advance from Customer', accountType: 'LIABILITY', normalSide: 'CREDIT' },
  { code: '5100', name: 'Refunds & Credit Notes', accountType: 'EXPENSE', normalSide: 'DEBIT' },
];

const PAYMENT_MODE_ACCOUNT = {
  CASH: '1100',
  CARD: '1110',
  UPI: '1110',
  BANK_TRANSFER: '1110',
  CHEQUE: '1110',
  LOAN: '1200',
  ADVANCE: '1300',
  BAJAJ: '1200',
  ONLINE: '1110',
  CREDIT: '1200',
  OTHER: '1110',
};

export async function ensureChartOfAccounts() {
  for (const acct of DEFAULT_ACCOUNTS) {
    await prisma.chartOfAccount.upsert({
      where: { code: acct.code },
      create: acct,
      update: { name: acct.name, accountType: acct.accountType, normalSide: acct.normalSide },
    });
  }
}

async function getAccount(code, tx = prisma) {
  const acct = await tx.chartOfAccount.findUnique({ where: { code } });
  if (!acct) throw new Error(`Chart of account ${code} not found — run seed`);
  return acct;
}

async function createJournalEntry(tx, { branchId, sourceType, sourceId, description, createdById, lines }) {
  const entryNo = await generateNumber('JE', 'journalEntry', 'entryNo');
  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(debitTotal - creditTotal) > 0.01) {
    throw new Error(`Journal entry unbalanced: DR ${debitTotal} CR ${creditTotal}`);
  }

  return tx.journalEntry.create({
    data: {
      entryNo,
      branchId,
      sourceType,
      sourceId,
      description,
      createdById,
      lines: { create: lines },
    },
    include: { lines: { include: { account: true } } },
  });
}

export async function postBillJournal({ bill, createdById, tx }) {
  const db = tx || prisma;
  const run = async (innerTx) => {
    const existing = await innerTx.journalEntry.findFirst({
      where: { sourceType: 'BILL', sourceId: bill.id },
    });
    if (existing) return existing;

    const ar = await getAccount('1200', innerTx);
    const revenueCode = bill.billType === 'PHARMACY' ? '4200' : '4100';
    const revenue = await getAccount(revenueCode, innerTx);
    const gst = bill.taxAmount > 0 ? await getAccount('2100', innerTx) : null;

    const lines = [
      { accountId: ar.id, debit: bill.totalAmount, credit: 0, memo: `Bill ${bill.billNo}` },
      { accountId: revenue.id, debit: 0, credit: bill.subtotal - bill.discount, memo: 'Revenue' },
    ];
    if (gst && bill.taxAmount > 0) {
      lines.push({ accountId: gst.id, debit: 0, credit: bill.taxAmount, memo: 'GST output' });
    }

    return createJournalEntry(innerTx, {
      branchId: bill.branchId,
      sourceType: 'BILL',
      sourceId: bill.id,
      description: `Bill ${bill.billNo} — revenue recognition`,
      createdById,
      lines,
    });
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

export async function postPaymentJournal({ payment, bill, createdById, tx }) {
  const db = tx || prisma;
  const run = async (innerTx) => {
    const existing = await innerTx.journalEntry.findFirst({
      where: { sourceType: 'PAYMENT', sourceId: payment.id },
    });
    if (existing) return existing;

    const cashCode = PAYMENT_MODE_ACCOUNT[payment.paymentMode] || '1110';
    const cash = await getAccount(cashCode, innerTx);
    const ar = await getAccount('1200', innerTx);

    return createJournalEntry(innerTx, {
      branchId: bill.branchId,
      sourceType: 'PAYMENT',
      sourceId: payment.id,
      description: `Payment on ${bill.billNo} via ${payment.paymentMode}`,
      createdById,
      lines: [
        { accountId: cash.id, debit: payment.amount, credit: 0, memo: payment.referenceNo || payment.paymentMode },
        { accountId: ar.id, debit: 0, credit: payment.amount, memo: `Bill ${bill.billNo}` },
      ],
    });
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

/** Post bill + any nested payments that lack journal entries */
export async function syncBillLedgers(billId, createdById) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { payments: true },
  });
  if (!bill) return null;
  await postBillJournal({ bill, createdById }).catch(() => {});
  for (const payment of bill.payments) {
    await postPaymentJournal({ payment, bill, createdById }).catch(() => {});
  }
  return bill;
}

export async function postRefundJournal({ creditNote, bill, userId, tx, paymentMode = 'CASH' }) {
  const run = async (innerTx) => {
    const existing = await innerTx.journalEntry.findFirst({
      where: { sourceType: 'REFUND', sourceId: creditNote.id },
    });
    if (existing) return existing;

    const refunds = await getAccount('5100', innerTx);
    const cashCode = PAYMENT_MODE_ACCOUNT[paymentMode] || '1100';
    const cash = await getAccount(cashCode, innerTx);

    return createJournalEntry(innerTx, {
      branchId: bill.branchId,
      sourceType: 'REFUND',
      sourceId: creditNote.id,
      description: `Refund ${creditNote.creditNoteNo} on ${bill.billNo}`,
      createdById: userId,
      lines: [
        { accountId: refunds.id, debit: creditNote.amount, credit: 0, memo: creditNote.reason },
        { accountId: cash.id, debit: 0, credit: creditNote.amount, memo: 'Cash/bank out' },
      ],
    });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function postCreditNoteJournal({ creditNote, bill, userId, tx }) {
  const run = async (innerTx) => {
    const existing = await innerTx.journalEntry.findFirst({
      where: { sourceType: 'CREDIT_NOTE', sourceId: creditNote.id },
    });
    if (existing) return existing;

    const refunds = await getAccount('5100', innerTx);
    const ar = await getAccount('1200', innerTx);

    return createJournalEntry(innerTx, {
      branchId: bill.branchId,
      sourceType: 'CREDIT_NOTE',
      sourceId: creditNote.id,
      description: `Credit note ${creditNote.creditNoteNo} on ${bill.billNo}`,
      createdById: userId,
      lines: [
        { accountId: refunds.id, debit: creditNote.amount, credit: 0, memo: creditNote.reason },
        { accountId: ar.id, debit: 0, credit: creditNote.amount, memo: 'Reduce AR' },
      ],
    });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function postBillReversalJournal({ bill, userId, tx, reason }) {
  const run = async (innerTx) => {
    const existing = await innerTx.journalEntry.findFirst({
      where: { sourceType: 'BILL_REVERSAL', sourceId: bill.id },
    });
    if (existing) return existing;

    const ar = await getAccount('1200', innerTx);
    const revenueCode = bill.billType === 'PHARMACY' ? '4200' : '4100';
    const revenue = await getAccount(revenueCode, innerTx);
    const gst = bill.taxAmount > 0 ? await getAccount('2100', innerTx) : null;
    const netRevenue = bill.subtotal - bill.discount;

    const lines = [
      { accountId: revenue.id, debit: netRevenue, credit: 0, memo: 'Revenue reversal' },
      { accountId: ar.id, debit: 0, credit: bill.totalAmount, memo: `Cancel ${bill.billNo}` },
    ];
    if (gst && bill.taxAmount > 0) {
      lines.splice(1, 0, { accountId: gst.id, debit: bill.taxAmount, credit: 0, memo: 'GST reversal' });
    }

    return createJournalEntry(innerTx, {
      branchId: bill.branchId,
      sourceType: 'BILL_REVERSAL',
      sourceId: bill.id,
      description: reason || `Bill ${bill.billNo} cancelled`,
      createdById: userId,
      lines,
    });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function getLedgerDaySummary(branchId, from, to) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      branchId,
      entryDate: { gte: from, lte: to },
      sourceType: { in: ['PAYMENT', 'REFUND', 'DAY_CLOSE'] },
    },
    include: { lines: { include: { account: true } } },
  });

  const collections = { CASH: 0, CARD: 0, UPI: 0, BANK: 0, OTHER: 0 };
  let refunds = 0;

  for (const entry of entries) {
    if (entry.sourceType === 'REFUND') {
      refunds += entry.lines.reduce((s, l) => s + l.credit, 0);
      continue;
    }
    if (entry.sourceType !== 'PAYMENT') continue;
    for (const line of entry.lines) {
      if (line.debit <= 0 || line.account.code === '1200') continue;
      const code = line.account.code;
      if (code === '1100') collections.CASH += line.debit;
      else if (code === '1110') collections.BANK += line.debit;
      else collections.OTHER += line.debit;
    }
  }

  const totalDebits = entries
    .filter((e) => e.sourceType === 'PAYMENT')
    .flatMap((e) => e.lines)
    .reduce((s, l) => s + l.debit, 0);

  return { collections, refunds, totalCollections: totalDebits, entryCount: entries.length };
}

export async function postDayCloseJournal({ dayClose, userId }) {
  const existing = await prisma.journalEntry.findFirst({
    where: { sourceType: 'DAY_CLOSE', sourceId: dayClose.id },
  });
  if (existing) return existing;

  const cash = await getAccount('1100');
  const varianceAcct = await getAccount('5100');
  const lines = [];

  if (Math.abs(dayClose.variance) > 0.01) {
    const v = Math.abs(dayClose.variance);
    if (dayClose.variance > 0) {
      lines.push(
        { accountId: cash.id, debit: v, credit: 0, memo: 'Physical cash over' },
        { accountId: varianceAcct.id, debit: 0, credit: v, memo: 'Cash overage' },
      );
    } else {
      lines.push(
        { accountId: varianceAcct.id, debit: v, credit: 0, memo: 'Physical cash short' },
        { accountId: cash.id, debit: 0, credit: v, memo: 'Cash shortage' },
      );
    }
  } else {
    const marker = 0.01;
    lines.push(
      { accountId: cash.id, debit: marker, credit: 0, memo: `Day ${dayClose.closeNo} reconciled — collections ₹${dayClose.collectionsTotal}` },
      { accountId: cash.id, debit: 0, credit: marker, memo: 'Ledger tie-out' },
    );
  }

  return prisma.$transaction(async (tx) => createJournalEntry(tx, {
    branchId: dayClose.branchId,
    sourceType: 'DAY_CLOSE',
    sourceId: dayClose.id,
    description: `Day close ${dayClose.closeNo} locked`,
    createdById: userId,
    lines,
  }));
}

export async function getLedgerEntries({ branchFilter = {}, limit = 100 } = {}) {
  return prisma.journalEntry.findMany({
    where: branchFilter.branchId ? { branchId: branchFilter.branchId } : {},
    include: {
      branch: true,
      lines: { include: { account: true } },
    },
    orderBy: { entryDate: 'desc' },
    take: limit,
  });
}
