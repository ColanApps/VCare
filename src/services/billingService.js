import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { adjustStock } from './stockService.js';
import { applyDiscountsToItems } from './discountService.js';
import { postBillJournal, postBillReversalJournal, postRefundJournal, postCreditNoteJournal, syncBillLedgers } from './ledgerService.js';
import { assertDateNotLocked } from './financeDayLockService.js';

export function assertCreatePaymentAllowed(paidAmount, roleCode) {
  const paid = parseFloat(paidAmount) || 0;
  if (paid > 0 && !['ACCOUNTS', 'SUPER_ADMIN', 'BRANCH_MANAGER'].includes(roleCode)) {
    throw new Error('Only Accounts can record payment at bill creation. Create the bill with zero paid amount.');
  }
}

/** Resolve which branch a bill belongs to (required by schema). */
export function resolveBillBranchId({ bodyBranchId, userBranchId, customerBranchId }) {
  const branchId = bodyBranchId || userBranchId || customerBranchId;
  if (!branchId) {
    throw new Error('Branch is required. Select a branch or pick a customer that belongs to a branch.');
  }
  return branchId;
}

/** List filter — include bills tagged to the branch or for customers at that branch. */
export function billListWhere(branchFilter = {}) {
  if (!branchFilter.branchId) return {};
  return {
    OR: [
      { branchId: branchFilter.branchId },
      { customer: { branchId: branchFilter.branchId } },
    ],
  };
}

async function deductStockForBillItems({ billId, billNo, branchId, items, createdById }) {
  for (const item of items) {
    if (item.itemType !== 'PRODUCT') continue;
    const product = await prisma.product.findFirst({ where: { sku: item.itemCode, isActive: true } });
    if (!product) continue;
    await adjustStock({
      productId: product.id,
      branchId,
      quantity: -item.quantity,
      movementType: 'OUTWARD',
      referenceType: 'BILL',
      referenceId: billId,
      notes: `Bill ${billNo}`,
      createdById,
    });
  }
}

export async function reverseStockForBill({ billId, createdById }) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: true },
  });
  if (!bill) return;

  for (const item of bill.items) {
    if (item.itemType !== 'PRODUCT') continue;
    const product = await prisma.product.findFirst({ where: { sku: item.itemCode } });
    if (!product) continue;
    await adjustStock({
      productId: product.id,
      branchId: bill.branchId,
      quantity: item.quantity,
      movementType: 'RETURN',
      referenceType: 'BILL_CANCEL',
      referenceId: billId,
      notes: `Reversal for bill ${bill.billNo}`,
      createdById,
    });
  }
}

export async function createStandardBill({
  customerId,
  branchId,
  createdById,
  rawItems,
  customerCategory,
  discount = 0,
  paidAmount = 0,
  paymentMode,
  referenceNo,
  useInstallmentPlan,
  installmentRate,
  installmentTenure,
  roleCode,
}) {
  assertCreatePaymentAllowed(paidAmount, roleCode);
  const billNo = await generateNumber('BILL', 'bill', 'billNo');
  const items = await applyDiscountsToItems(rawItems, customerCategory || 'ALL');
  let subtotal = 0;
  let taxAmount = 0;

  const billItems = items.map((item) => {
    const lineSubtotal = item.quantity * item.unitPrice - (item.discount || 0);
    const lineTax = lineSubtotal * ((item.taxRate || 18) / 100);
    subtotal += lineSubtotal;
    taxAmount += lineTax;
    return {
      itemType: item.itemType,
      itemCode: item.itemCode,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount || 0,
      taxRate: item.taxRate || 18,
      taxAmount: lineTax,
      totalAmount: lineSubtotal + lineTax,
    };
  });

  const headerDiscount = parseFloat(discount) || 0;
  const totalAmount = subtotal + taxAmount - headerDiscount;
  const paid = parseFloat(paidAmount) || 0;

  const bill = await prisma.bill.create({
    data: {
      billNo,
      customerId,
      branchId,
      createdById,
      subtotal,
      discount: headerDiscount,
      taxAmount,
      totalAmount,
      paidAmount: paid,
      balanceAmount: totalAmount - paid,
      status: paid >= totalAmount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
      paymentMode,
      items: { create: billItems },
      ...(paid > 0
        ? {
            payments: {
              create: {
                amount: paid,
                paymentMode: paymentMode || 'CASH',
                referenceNo,
              },
            },
          }
        : {}),
    },
    include: { items: true, payments: true },
  });

  await deductStockForBillItems({
    billId: bill.id,
    billNo,
    branchId,
    items: bill.items,
    createdById,
  }).catch((err) => {
    console.warn(`Bill ${billNo}: stock deduction skipped — ${err.message}`);
  });

  await syncBillLedgers(bill.id, createdById);

  return { bill, billNo, useInstallmentPlan, installmentRate, installmentTenure };
}

export async function cancelBill({ billId, reason, userId }) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');
  if (bill.status === 'CANCELLED') throw new Error('Bill already cancelled');
  await assertDateNotLocked(bill.branchId, bill.billDate, 'cancel bills');

  const creditNoteNo = await generateNumber('CN', 'creditNote', 'creditNoteNo');
  let creditNote = null;

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: billId },
      data: { status: 'CANCELLED', balanceAmount: 0 },
    });

    if (bill.paidAmount > 0) {
      creditNote = await tx.creditNote.create({
        data: {
          creditNoteNo,
          billId,
          amount: bill.paidAmount,
          reason: reason || 'Bill cancellation',
          type: 'CANCELLATION',
          status: 'ISSUED',
          createdById: userId,
        },
      });
    }
  });

  await postBillReversalJournal({ bill, userId, reason: reason || 'Bill cancellation' }).catch(() => {});
  if (creditNote) {
    await postRefundJournal({ creditNote, bill, userId, paymentMode: bill.paymentMode || 'CASH' }).catch(() => {});
  }

  await reverseStockForBill({ billId, createdById: userId });
}

export async function issueRefund({ billId, amount, reason, userId }) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');
  if (amount > bill.paidAmount) throw new Error('Refund exceeds paid amount');
  await assertDateNotLocked(bill.branchId, bill.billDate, 'process refunds');

  const creditNoteNo = await generateNumber('CN', 'creditNote', 'creditNoteNo');

  const creditNote = await prisma.$transaction(async (tx) => {
    const newPaid = bill.paidAmount - amount;
    const newBalance = bill.totalAmount - newPaid;
    const status = newPaid <= 0 ? 'REFUNDED' : bill.status;

    const cn = await tx.creditNote.create({
      data: {
        creditNoteNo,
        billId,
        amount,
        reason,
        type: 'REFUND',
        status: 'PROCESSED',
        createdById: userId,
      },
    });

    await tx.bill.update({
      where: { id: billId },
      data: { paidAmount: newPaid, balanceAmount: newBalance, status },
    });
    return cn;
  });

  await postRefundJournal({ creditNote, bill, userId, paymentMode: bill.paymentMode || 'CASH' }).catch(() => {});
  return creditNote;
}

export async function issueCreditNote({ billId, amount, reason, userId }) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');
  if (amount <= 0) throw new Error('Credit note amount must be positive');
  if (amount > bill.balanceAmount) throw new Error('Credit note exceeds outstanding balance');
  await assertDateNotLocked(bill.branchId, bill.billDate, 'issue credit notes');

  const creditNoteNo = await generateNumber('CN', 'creditNote', 'creditNoteNo');

  const creditNote = await prisma.$transaction(async (tx) => {
    const newTotal = bill.totalAmount - amount;
    const newBalance = Math.max(0, bill.balanceAmount - amount);
    const status = newBalance <= 0 ? 'PAID' : bill.status;

    const cn = await tx.creditNote.create({
      data: {
        creditNoteNo,
        billId,
        amount,
        reason,
        type: 'CREDIT_NOTE',
        status: 'ISSUED',
        createdById: userId,
      },
    });

    await tx.bill.update({
      where: { id: billId },
      data: { totalAmount: newTotal, balanceAmount: newBalance, status },
    });
    return cn;
  });

  const updatedBill = { ...bill, totalAmount: bill.totalAmount - amount, balanceAmount: Math.max(0, bill.balanceAmount - amount) };
  await postCreditNoteJournal({ creditNote, bill: updatedBill, userId }).catch(() => {});
  return creditNote;
}

export async function getCreditNotes(billId) {
  return prisma.creditNote.findMany({
    where: billId ? { billId } : {},
    include: { bill: { include: { customer: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
