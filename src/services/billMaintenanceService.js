import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { createStandardBill, assertCreatePaymentAllowed } from './billingService.js';

async function logMaintenance({ billId, action, oldValue, newValue, reason, changedById }) {
  return prisma.billMaintenanceLog.create({
    data: { billId, action, oldValue, newValue, reason, changedById },
  });
}

export async function changeBillDate({ billId, billDate, reason, userId }) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.status === 'CANCELLED') throw new Error('Bill cannot be modified');
  const old = bill.billDate.toISOString();
  await prisma.bill.update({ where: { id: billId }, data: { billDate: new Date(billDate) } });
  await logMaintenance({ billId, action: 'DATE_CHANGE', oldValue: old, newValue: billDate, reason, changedById: userId });
}

export async function changeBillConsultant({ billId, consultantId, reason, userId }) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.status === 'CANCELLED') throw new Error('Bill cannot be modified');
  const old = bill.createdById;
  await prisma.bill.update({ where: { id: billId }, data: { createdById: consultantId } });
  await logMaintenance({ billId, action: 'CONSULTANT_CHANGE', oldValue: old, newValue: consultantId, reason, changedById: userId });
}

export async function changePaymentMode({ billId, paymentMode, reason, userId }) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.status === 'CANCELLED') throw new Error('Bill cannot be modified');
  const old = bill.paymentMode || '';
  await prisma.bill.update({ where: { id: billId }, data: { paymentMode } });
  await logMaintenance({ billId, action: 'PAYMENT_MODE', oldValue: old, newValue: paymentMode, reason, changedById: userId });
}

export async function upgradeBill({ originalBillId, items, customerCategory, userId, upgradeBy, notes }) {
  const original = await prisma.bill.findUnique({ where: { id: originalBillId }, include: { customer: true } });
  if (!original) throw new Error('Original bill not found');

  const { bill } = await createStandardBill({
    customerId: original.customerId,
    branchId: original.branchId,
    createdById: userId,
    rawItems: items,
    customerCategory: customerCategory || original.customer?.category,
    discount: 0,
    paidAmount: 0,
    paymentMode: original.paymentMode,
    roleCode: 'SUPER_ADMIN',
  });

  await logMaintenance({
    billId: originalBillId,
    action: 'UPGRADE',
    oldValue: original.billNo,
    newValue: bill.billNo,
    reason: `${upgradeBy}: ${notes || 'Package upgrade'}`,
    changedById: userId,
  });

  return bill;
}

export async function createServiceB2BBill({ customerId, branchId, createdById, items, buyerGstin, poReference, paidAmount, paymentMode, roleCode }) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.customerType !== 'CORPORATE') {
    throw new Error('Service B2B requires a corporate customer');
  }
  assertCreatePaymentAllowed(paidAmount, roleCode);

  const billNo = await generateNumber('S2B', 'bill', 'billNo');
  let subtotal = 0;
  let taxAmount = 0;
  const billItems = items.map((item) => {
    const lineSubtotal = item.quantity * item.unitPrice - (item.discount || 0);
    const lineTax = lineSubtotal * ((item.taxRate || 18) / 100);
    subtotal += lineSubtotal;
    taxAmount += lineTax;
    return {
      itemType: item.itemType || 'SERVICE',
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

  const totalAmount = subtotal + taxAmount;
  const paid = parseFloat(paidAmount) || 0;

  const bill = await prisma.bill.create({
    data: {
      billNo,
      customerId,
      branchId,
      createdById,
      billType: 'SERVICE',
      source: 'B2B',
      buyerGstin: buyerGstin || customer.gstin,
      poReference,
      subtotal,
      taxAmount,
      totalAmount,
      paidAmount: paid,
      balanceAmount: totalAmount - paid,
      status: paid >= totalAmount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
      paymentMode: paymentMode || 'BANK_TRANSFER',
      items: { create: billItems },
      ...(paid > 0 ? { payments: { create: { amount: paid, paymentMode: paymentMode || 'BANK_TRANSFER', referenceNo: poReference } } } : {}),
    },
    include: { payments: true },
  });

  const { syncBillLedgers } = await import('./ledgerService.js');
  await syncBillLedgers(bill.id, createdById);
  return bill;
}

export async function createPermanentRefund({ customerId, billId, amount, reason, createdById, attachmentPath }) {
  const refundNo = await generateNumber('PRF', 'permanentRefund', 'refundNo');
  return prisma.permanentRefund.create({
    data: { refundNo, customerId, billId: billId || null, amount: parseFloat(amount), reason, createdById, attachmentPath: attachmentPath || null },
    include: { customer: true },
  });
}

export async function approvePermanentRefund({ refundId, approvedById }) {
  const refund = await prisma.permanentRefund.findUnique({ where: { id: refundId } });
  if (!refund) throw new Error('Permanent refund not found');
  if (refund.status !== 'PENDING') throw new Error('Refund is not pending approval');

  const updated = await prisma.permanentRefund.update({
    where: { id: refundId },
    data: { status: 'APPROVED', approvedById },
  });

  if (refund.billId) {
    const { issueRefund } = await import('./billingService.js');
    await issueRefund({
      billId: refund.billId,
      amount: refund.amount,
      reason: `Permanent refund ${refund.refundNo}: ${refund.reason || ''}`.trim(),
      userId: approvedById,
    });
  } else {
    throw new Error('Permanent refund requires a linked bill to post financial entries');
  }

  return updated;
}

export async function createCashDeposit({ customerId, branchId, amount, purpose, paymentMode, createdById, proofPath }) {
  const depositNo = await generateNumber('CDP', 'cashDeposit', 'depositNo');
  return prisma.cashDeposit.create({
    data: {
      depositNo,
      customerId,
      branchId,
      amount: parseFloat(amount),
      purpose,
      paymentMode: paymentMode || 'CASH',
      createdById,
      proofPath: proofPath || null,
    },
    include: { customer: true, branch: true },
  });
}

export async function getBillMaintenanceLogs(billId) {
  return prisma.billMaintenanceLog.findMany({
    where: { billId },
    orderBy: { createdAt: 'desc' },
  });
}
