import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { createGrnReceipt, completeGrnQuality } from './grnService.js';

const indentInclude = {
  branch: true,
  items: { include: { product: true } },
  purchaseOrders: { include: { vendor: true, grns: true } },
};

export async function listFactoryIndents({ status, q } = {}) {
  return prisma.factoryIndent.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ indentNo: { contains: q } }, { branch: { name: { contains: q } } }] } : {}),
    },
    include: indentInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createFactoryIndent({ branchId, items, notes, createdById }) {
  const indentNo = await generateNumber('FIN', 'factoryIndent', 'indentNo');
  return prisma.factoryIndent.create({
    data: {
      indentNo,
      branchId,
      notes,
      createdById,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          quantity: parseInt(i.quantity, 10),
        })),
      },
    },
    include: indentInclude,
  });
}

export async function approveFactoryIndent({ indentId, action, approvedById }) {
  const indent = await prisma.factoryIndent.findUnique({ where: { id: indentId } });
  if (!indent) throw new Error('Factory indent not found');
  if (indent.status !== 'PENDING') throw new Error('Indent is not pending approval');
  return prisma.factoryIndent.update({
    where: { id: indentId },
    data: {
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
      approvedById,
      approvedAt: new Date(),
    },
    include: indentInclude,
  });
}

export async function receiveFactoryInward({ indentId, vendorId, branchId, items, notes, createdById }) {
  const indent = await prisma.factoryIndent.findFirst({
    where: { id: indentId, status: { in: ['APPROVED', 'PARTIAL'] } },
    include: { items: { include: { product: true } } },
  });
  if (!indent) throw new Error('Approved factory indent not found');

  const poNo = await generateNumber('FPO', 'purchaseOrder', 'poNo');
  let totalAmount = 0;
  const poItems = items.map((i) => {
    const qty = parseInt(i.quantity, 10);
    const unitPrice = parseFloat(i.unitPrice) || 0;
    const total = qty * unitPrice;
    totalAmount += total;
    return { productId: i.productId, quantity: qty, unitPrice, totalAmount: total };
  });

  const po = await prisma.purchaseOrder.create({
    data: {
      poNo,
      vendorId,
      branchId: branchId || indent.branchId,
      factoryIndentId: indentId,
      orderType: 'FACTORY',
      status: 'APPROVED',
      totalAmount,
      notes,
      items: { create: poItems },
    },
  });

  const grn = await createGrnReceipt({
    poId: po.id,
    branchId: branchId || indent.branchId,
    items,
    notes,
    grnType: 'FACTORY',
    factoryIndentId: indentId,
  });

  const allFulfilled = indent.items.every((line) => {
    const received = items.find((i) => i.productId === line.productId);
    const qty = received ? parseInt(received.quantity, 10) : 0;
    return line.fulfilled + qty >= line.quantity;
  });

  for (const line of indent.items) {
    const received = items.find((i) => i.productId === line.productId);
    if (received) {
      await prisma.factoryIndentItem.update({
        where: { id: line.id },
        data: { fulfilled: line.fulfilled + parseInt(received.quantity, 10) },
      });
    }
  }

  await prisma.factoryIndent.update({
    where: { id: indentId },
    data: { status: allFulfilled ? 'FULFILLED' : 'PARTIAL' },
  });

  return { po, grn };
}

export async function listFactoryInwards({ status, q } = {}) {
  return prisma.gRN.findMany({
    where: {
      grnType: 'FACTORY',
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ grnNo: { contains: q } }, { po: { poNo: { contains: q } } }] } : {}),
    },
    include: {
      po: { include: { vendor: true } },
      factoryIndent: { include: { branch: true } },
      items: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export { completeGrnQuality };
