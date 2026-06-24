import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { createGrnReceipt, completeGrnQuality } from './grnService.js';

const apoInclude = {
  vendor: true,
  items: true,
};

export async function listAssetPOs({ status, q } = {}) {
  return prisma.assetPurchaseOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ apoNo: { contains: q } }, { vendor: { name: { contains: q } } }] } : {}),
    },
    include: apoInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createAssetPO({ vendorId, branchId, items, notes, createdById }) {
  const apoNo = await generateNumber('ASPO', 'assetPurchaseOrder', 'apoNo');
  let totalAmount = 0;
  const apoItems = items.map((i) => {
    const total = i.quantity * i.unitCost;
    totalAmount += total;
    return {
      description: i.description,
      quantity: i.quantity,
      unitCost: i.unitCost,
      totalAmount: total,
    };
  });
  return prisma.assetPurchaseOrder.create({
    data: {
      apoNo,
      vendorId: vendorId || null,
      branchId: branchId || null,
      status: 'PENDING_AUTH',
      totalAmount,
      notes,
      createdById,
      items: { create: apoItems },
    },
    include: apoInclude,
  });
}

export async function authorizeAssetPO({ apoId, action }) {
  const apo = await prisma.assetPurchaseOrder.findUnique({ where: { id: apoId } });
  if (!apo) throw new Error('Asset PO not found');
  if (apo.status !== 'PENDING_AUTH') throw new Error('Asset PO not pending authorization');
  return prisma.assetPurchaseOrder.update({
    where: { id: apoId },
    data: { status: action === 'approve' ? 'APPROVED' : 'CANCELLED' },
    include: apoInclude,
  });
}

export async function createAssetGRN({ apoId, vendorId, branchId, items, notes }) {
  const apo = await prisma.assetPurchaseOrder.findFirst({
    where: { id: apoId, status: 'APPROVED' },
    include: { items: true, vendor: true },
  });
  if (!apo) throw new Error('Approved asset PO not found');

  const poNo = await generateNumber('APO-L', 'purchaseOrder', 'poNo');
  const products = await prisma.product.findMany({ where: { isActive: true }, take: 1 });
  const fallbackProduct = products[0];
  if (!fallbackProduct) throw new Error('No product in catalog for asset GRN linkage');

  let totalAmount = 0;
  const poItems = apo.items.map((line) => {
    const qty = line.quantity;
    const unitPrice = line.unitCost;
    const total = qty * unitPrice;
    totalAmount += total;
    return { productId: fallbackProduct.id, quantity: qty, unitPrice, totalAmount: total };
  });

  const po = await prisma.purchaseOrder.create({
    data: {
      poNo,
      vendorId: vendorId || apo.vendorId,
      branchId,
      orderType: 'ASSET',
      status: 'APPROVED',
      totalAmount,
      notes: `Asset PO ${apo.apoNo}. ${notes || ''}`.trim(),
      items: { create: poItems },
    },
  });

  const grnItems = apo.items.map((line, idx) => ({
    productId: fallbackProduct.id,
    quantity: line.quantity,
    batchNo: `AST-${apo.apoNo}-${idx + 1}`,
    unitPrice: line.unitCost,
  }));

  return createGrnReceipt({
    poId: po.id,
    branchId,
    items: grnItems,
    notes: `Asset receipt for ${apo.apoNo}`,
    grnType: 'ASSET',
  });
}

export async function listAssetGRNs() {
  return prisma.gRN.findMany({
    where: { grnType: 'ASSET', status: { in: ['DRAFT', 'QUALITY_CHECK'] } },
    include: { po: { include: { vendor: true } }, items: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export { completeGrnQuality };
