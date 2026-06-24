import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { receiveGrnStock } from './stockService.js';

export async function createGrnReceipt({ poId, branchId, items, notes, grnType = 'STANDARD', factoryIndentId = null }) {
  const grnNo = await generateNumber('GRN', 'gRN', 'grnNo');
  return prisma.gRN.create({
    data: {
      grnNo,
      poId,
      grnType,
      branchId,
      factoryIndentId,
      status: 'QUALITY_CHECK',
      notes,
      items: {
        create: items
          .filter((i) => parseInt(i.quantity, 10) > 0)
          .map((i) => ({
            productId: i.productId,
            quantity: parseInt(i.quantity, 10),
            batchNo: i.batchNo || 'BATCH001',
            branchId,
            qualityStatus: 'PENDING',
          })),
      },
    },
    include: { items: { include: { product: true } }, po: { include: { vendor: true } } },
  });
}

export async function getPendingGrns() {
  return prisma.gRN.findMany({
    where: { status: 'QUALITY_CHECK' },
    include: {
      po: { include: { vendor: true } },
      items: { include: { product: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getGrnPendingProducts() {
  const pos = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['APPROVED', 'PARTIAL'] } },
    include: { vendor: true, items: { include: { product: true } } },
  });
  return pos.flatMap((po) =>
    po.items
      .filter((i) => i.received < i.quantity)
      .map((i) => ({
        po,
        product: i.product,
        ordered: i.quantity,
        received: i.received,
        pending: i.quantity - i.received,
      }))
  );
}

export async function completeGrnQuality({ grnId, action, itemQuality, checkedById }) {
  const grn = await prisma.gRN.findUnique({
    where: { id: grnId },
    include: { items: { include: { product: true } }, po: true },
  });
  if (!grn) throw new Error('GRN not found');
  if (grn.status !== 'QUALITY_CHECK') throw new Error('GRN is not pending quality check');

  if (action === 'reject') {
    await prisma.gRN.update({ where: { id: grnId }, data: { status: 'REJECTED' } });
    for (const q of itemQuality || []) {
      await prisma.gRNItem.update({
        where: { id: q.itemId },
        data: { qualityStatus: 'FAILED', qualityNotes: q.qualityNotes || 'Rejected' },
      });
    }
    return grn;
  }

  const passedItems = [];
  for (const item of grn.items) {
    const q = (itemQuality || []).find((x) => x.itemId === item.id);
    const status = q?.qualityStatus || 'PASSED';
    await prisma.gRNItem.update({
      where: { id: item.id },
      data: {
        qualityStatus: status,
        qualityNotes: q?.qualityNotes || null,
        expiryDate: q?.expiryDate ? new Date(q.expiryDate) : null,
      },
    });
    if (status === 'PASSED') {
      passedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        batchNo: item.batchNo,
      });
    }
  }

  if (passedItems.length > 0) {
    const branchId = grn.items[0]?.branchId;
    await receiveGrnStock({
      grnId,
      poId: grn.poId,
      branchId,
      items: passedItems,
      createdById: checkedById,
      skipItemCreate: true,
    });
  }

  await prisma.gRN.update({ where: { id: grnId }, data: { status: 'ACCEPTED' } });
  return prisma.gRN.findUnique({
    where: { id: grnId },
    include: { items: { include: { product: true } }, po: { include: { vendor: true } } },
  });
}
