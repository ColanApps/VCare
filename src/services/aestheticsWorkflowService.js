import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { createGrnReceipt, completeGrnQuality } from './grnService.js';
import { createStandardBill } from './billingService.js';

const poInclude = {
  vendor: true,
  branch: true,
  items: { include: { product: true } },
  grns: { include: { items: true } },
};

export async function listAestheticsPOs({ status, q } = {}) {
  return prisma.purchaseOrder.findMany({
    where: {
      orderType: 'AESTHETICS',
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ poNo: { contains: q } }, { vendor: { name: { contains: q } } }] } : {}),
    },
    include: poInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createAestheticsPO({ vendorId, branchId, items, notes, expectedDate }) {
  if (!branchId) throw new Error('Center branch is required for aesthetics PO');
  const poNo = await generateNumber('APO', 'purchaseOrder', 'poNo');
  let totalAmount = 0;
  const poItems = items.map((i) => {
    const total = i.quantity * i.unitPrice;
    totalAmount += total;
    return { productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, totalAmount: total };
  });
  return prisma.purchaseOrder.create({
    data: {
      poNo,
      vendorId,
      branchId,
      orderType: 'AESTHETICS',
      status: 'PENDING_AUTH',
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      totalAmount,
      notes,
      items: { create: poItems },
    },
    include: poInclude,
  });
}

export async function authorizeAestheticsPO({ poId, action }) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, orderType: 'AESTHETICS' } });
  if (!po) throw new Error('Aesthetics PO not found');
  if (po.status !== 'PENDING_AUTH') throw new Error('PO is not pending authorization');
  return prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: action === 'approve' ? 'APPROVED' : 'CANCELLED' },
    include: poInclude,
  });
}

export async function listAestheticsGRNs({ status, q } = {}) {
  return prisma.gRN.findMany({
    where: {
      grnType: 'AESTHETICS',
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ grnNo: { contains: q } }, { po: { poNo: { contains: q } } }] } : {}),
    },
    include: {
      po: { include: { vendor: true, branch: true } },
      items: { include: { product: true } },
      bill: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createAestheticsGRN({ poId, branchId, items, notes }) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, orderType: 'AESTHETICS', status: { in: ['APPROVED', 'PARTIAL'] } },
    include: { items: true },
  });
  if (!po) throw new Error('Approved aesthetics PO not found');
  const targetBranch = branchId || po.branchId;
  if (!targetBranch) throw new Error('Receiving branch required');
  return createGrnReceipt({
    poId,
    branchId: targetBranch,
    items,
    notes,
    grnType: 'AESTHETICS',
  });
}

export async function listAestheticsInvoices() {
  return prisma.bill.findMany({
    where: { grn: { grnType: 'AESTHETICS' } },
    include: { customer: true, branch: true, grn: { include: { po: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createAestheticsInvoice({ grnId, customerId, createdById, paidAmount = 0, paymentMode = 'CASH' }) {
  const grn = await prisma.gRN.findFirst({
    where: { id: grnId, grnType: 'AESTHETICS', status: 'ACCEPTED' },
    include: { items: { include: { product: true } }, po: true, bill: true },
  });
  if (!grn) throw new Error('Accepted aesthetics GRN not found');
  if (grn.bill) throw new Error('Invoice already created for this GRN');

  const rawItems = grn.items.map((item) => ({
    itemType: 'PRODUCT',
    itemCode: item.product.sku,
    itemName: item.product.name,
    quantity: item.quantity,
    unitPrice: item.product.costPrice || item.product.mrp,
    taxRate: item.product.taxRate || 18,
  }));

  const { bill, billNo } = await createStandardBill({
    customerId,
    branchId: grn.branchId || grn.po.branchId,
    createdById,
    rawItems,
    paidAmount,
    paymentMode,
  });

  await prisma.bill.update({
    where: { id: bill.id },
    data: {
      grnId: grn.id,
      poReference: grn.po.poNo,
      source: 'B2B',
    },
  });

  return { bill, billNo };
}

export { completeGrnQuality };
