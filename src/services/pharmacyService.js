import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { getApplicableDiscount } from './discountService.js';
import { adjustStock } from './stockService.js';
import { assertCreatePaymentAllowed } from './billingService.js';

export async function createPharmacyBill({ customerId, branchId, createdById, items, paymentMode, paidAmount, skipStockDeduction = false, procedureId, roleCode }) {
  assertCreatePaymentAllowed(paidAmount, roleCode);
  const billNo = await generateNumber('PHM', 'bill', 'billNo');
  let subtotal = 0;
  let taxAmount = 0;
  const billItems = [];

  for (const item of items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const lineSubtotal = item.quantity * product.mrp;
    const discountInfo = await getApplicableDiscount({
      type: 'PRODUCT',
      category: 'ALL',
      targetId: product.sku,
      lineAmount: lineSubtotal,
    });
    const lineAfterDiscount = lineSubtotal - (item.discount || discountInfo.amount);
    const lineTax = lineAfterDiscount * (product.taxRate / 100);
    subtotal += lineAfterDiscount;
    taxAmount += lineTax;

    billItems.push({
      itemType: 'PRODUCT',
      itemCode: product.sku,
      itemName: product.name,
      quantity: item.quantity,
      unitPrice: product.mrp,
      discount: item.discount || discountInfo.amount,
      taxRate: product.taxRate,
      taxAmount: lineTax,
      totalAmount: lineAfterDiscount + lineTax,
      productId: product.id,
    });
  }

  const totalAmount = subtotal + taxAmount;
  const paid = paidAmount || 0;

  const bill = await prisma.bill.create({
    data: {
      billNo,
      customerId,
      branchId,
      createdById,
      billType: 'PHARMACY',
      subtotal,
      taxAmount,
      totalAmount,
      paidAmount: paid,
      balanceAmount: totalAmount - paid,
      status: paid >= totalAmount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
      paymentMode,
      items: { create: billItems.map(({ productId, ...rest }) => rest) },
      ...(paid > 0 ? { payments: { create: { amount: paid, paymentMode: paymentMode || 'CASH' } } } : {}),
    },
    include: { payments: true },
  });

  if (!skipStockDeduction) {
    for (const item of billItems) {
      await adjustStock({
        productId: item.productId,
        branchId,
        quantity: -item.quantity,
        movementType: 'OUTWARD',
        referenceType: 'BILL',
        referenceId: bill.id,
        notes: `Pharmacy bill ${billNo}`,
        createdById,
      });
    }
  }

  if (procedureId) {
    await prisma.procedure.update({
      where: { id: procedureId },
      data: { pharmacyBillId: bill.id },
    });
    await prisma.clinicalConsumption.updateMany({
      where: { procedureId },
      data: { billId: bill.id },
    });
  }

  const { syncBillLedgers } = await import('./ledgerService.js');
  await syncBillLedgers(bill.id, createdById);

  return bill;
}

export async function createPharmacyB2BBill({
  customerId,
  branchId,
  createdById,
  items,
  paymentMode,
  paidAmount,
  buyerGstin,
  poReference,
  creditDays,
  roleCode,
}) {
  assertCreatePaymentAllowed(paidAmount, roleCode);

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.customerType !== 'CORPORATE') {
    throw new Error('B2B pharmacy billing requires a corporate customer account');
  }

  const billNo = await generateNumber('B2B', 'bill', 'billNo');
  let subtotal = 0;
  let taxAmount = 0;
  const billItems = [];

  for (const item of items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const unitPrice = item.unitPrice ?? product.mrp;
    const lineSubtotal = item.quantity * unitPrice;
    const discountInfo = await getApplicableDiscount({
      type: 'PRODUCT',
      category: 'ALL',
      targetId: product.sku,
      lineAmount: lineSubtotal,
    });
    const lineAfterDiscount = lineSubtotal - (item.discount || discountInfo.amount);
    const lineTax = lineAfterDiscount * (product.taxRate / 100);
    subtotal += lineAfterDiscount;
    taxAmount += lineTax;

    billItems.push({
      itemType: 'PRODUCT',
      itemCode: product.sku,
      itemName: product.name,
      quantity: item.quantity,
      unitPrice,
      discount: item.discount || discountInfo.amount,
      taxRate: product.taxRate,
      taxAmount: lineTax,
      totalAmount: lineAfterDiscount + lineTax,
      productId: product.id,
    });
  }

  const totalAmount = subtotal + taxAmount;
  const paid = paidAmount || 0;
  const gstin = buyerGstin || customer.gstin;

  const bill = await prisma.bill.create({
    data: {
      billNo,
      customerId,
      branchId,
      createdById,
      billType: 'PHARMACY',
      source: 'B2B',
      buyerGstin: gstin,
      poReference: poReference || null,
      subtotal,
      taxAmount,
      totalAmount,
      paidAmount: paid,
      balanceAmount: totalAmount - paid,
      status: paid >= totalAmount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
      paymentMode: paymentMode || (creditDays ? 'CREDIT' : 'BANK_TRANSFER'),
      items: { create: billItems.map(({ productId, ...rest }) => rest) },
      ...(paid > 0
        ? { payments: { create: { amount: paid, paymentMode: paymentMode || 'BANK_TRANSFER', referenceNo: poReference } } }
        : {}),
    },
  });

  for (const item of billItems) {
    await adjustStock({
      productId: item.productId,
      branchId,
      quantity: -item.quantity,
      movementType: 'OUTWARD',
      referenceType: 'BILL',
      referenceId: bill.id,
      notes: `B2B pharmacy invoice ${billNo}`,
      createdById,
    });
  }

  const { syncBillLedgers } = await import('./ledgerService.js');
  await syncBillLedgers(bill.id, createdById);

  return bill;
}

export async function createPharmacyBillFromProcedure(procedureId, userId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: { customer: true },
  });
  if (!procedure) throw new Error('Procedure not found');
  if (procedure.pharmacyBillId) {
    return prisma.bill.findUnique({ where: { id: procedure.pharmacyBillId } });
  }

  const consumptions = await prisma.clinicalConsumption.findMany({
    where: { procedureId },
    include: { product: true },
  });
  if (!consumptions.length) return null;

  const items = consumptions.map((c) => ({
    productId: c.productId,
    quantity: c.quantity,
  }));

  const branchId = procedure.branchId || procedure.customer.branchId;
  return createPharmacyBill({
    customerId: procedure.customerId,
    branchId,
    createdById: userId,
    items,
    skipStockDeduction: true,
    procedureId,
  });
}
