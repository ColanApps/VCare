import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { adjustStock } from './stockService.js';
import { assertCreatePaymentAllowed } from './billingService.js';

export async function createSalesOrder({ customerId, branchId, items, notes, createdById }) {
  const orderNo = await generateNumber('SO', 'salesOrder', 'orderNo');
  let totalAmount = 0;
  const orderItems = items.map((i) => {
    const total = i.quantity * i.unitPrice;
    totalAmount += total;
    return { productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, totalAmount: total };
  });

  return prisma.salesOrder.create({
    data: {
      orderNo,
      customerId,
      branchId,
      status: 'CONFIRMED',
      totalAmount,
      notes,
      createdById,
      items: { create: orderItems },
    },
    include: { items: { include: { product: true } }, customer: true, branch: true },
  });
}

export async function createDeliveryChallan({ orderId, notes, createdById }) {
  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order || order.status === 'CANCELLED') throw new Error('Invalid sales order');

  const challanNo = await generateNumber('DC', 'deliveryChallan', 'challanNo');
  return prisma.deliveryChallan.create({
    data: { challanNo, orderId, notes, createdById },
    include: { order: { include: { customer: true, items: { include: { product: true } } } } },
  });
}

export async function invoiceSalesOrder({ orderId, createdById, paidAmount, paymentMode, roleCode }) {
  assertCreatePaymentAllowed(paidAmount, roleCode);

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } }, customer: true },
  });
  if (!order) throw new Error('Sales order not found');
  if (order.billId) throw new Error('Order already invoiced');

  const billNo = await generateNumber('INV', 'bill', 'billNo');
  let subtotal = 0;
  let taxAmount = 0;
  const billItems = order.items.map((item) => {
    const lineSubtotal = item.quantity * item.unitPrice;
    const lineTax = lineSubtotal * (item.product.taxRate / 100);
    subtotal += lineSubtotal;
    taxAmount += lineTax;
    return {
      itemType: 'PRODUCT',
      itemCode: item.product.sku,
      itemName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.product.taxRate,
      taxAmount: lineTax,
      totalAmount: lineSubtotal + lineTax,
    };
  });

  const totalAmount = subtotal + taxAmount;
  const paid = parseFloat(paidAmount) || 0;

  const bill = await prisma.$transaction(async (tx) => {
    const newBill = await tx.bill.create({
      data: {
        billNo,
        customerId: order.customerId,
        branchId: order.branchId,
        createdById,
        billType: 'PRODUCT',
        source: order.customer.customerType === 'CORPORATE' ? 'B2B' : 'B2C',
        subtotal,
        taxAmount,
        totalAmount,
        paidAmount: paid,
        balanceAmount: totalAmount - paid,
        status: paid >= totalAmount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
        paymentMode: paymentMode || 'BANK_TRANSFER',
        items: { create: billItems },
        ...(paid > 0 ? { payments: { create: { amount: paid, paymentMode: paymentMode || 'BANK_TRANSFER' } } } : {}),
      },
    });

    await tx.salesOrder.update({
      where: { id: orderId },
      data: { status: 'INVOICED', billId: newBill.id },
    });

    return newBill;
  });

  for (const item of order.items) {
    await adjustStock({
      productId: item.productId,
      branchId: order.branchId,
      quantity: -item.quantity,
      movementType: 'OUTWARD',
      referenceType: 'SALES_ORDER',
      referenceId: order.id,
      notes: `Sales order ${order.orderNo} invoice`,
      createdById,
    });
  }

  const { syncBillLedgers } = await import('./ledgerService.js');
  await syncBillLedgers(bill.id, createdById);

  const { notifyBillWorkflow } = await import('./workflowOrchestrationService.js');
  const fullBill = await prisma.bill.findUnique({
    where: { id: bill.id },
    include: { payments: true },
  });
  await notifyBillWorkflow({ bill: fullBill, userId: createdById });

  return fullBill;
}
