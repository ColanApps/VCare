import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { adjustStock } from './stockService.js';

export async function createStockOutward({ branchId, stockType, destination, notes, items, createdById }) {
  const outwardNo = await generateNumber('OUT', 'stockOutward', 'outwardNo');
  return prisma.stockOutward.create({
    data: {
      outwardNo,
      branchId,
      stockType: stockType || 'BILLABLE',
      destination,
      notes,
      createdById,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          quantity: parseInt(i.quantity, 10),
        })),
      },
    },
    include: { items: { include: { product: true } }, branch: true },
  });
}

export async function authorizeStockOutward({ outwardId, authorizedById }) {
  const outward = await prisma.stockOutward.findUnique({
    where: { id: outwardId },
    include: { items: true },
  });
  if (!outward || outward.status !== 'PENDING') throw new Error('Outward not pending');

  await prisma.$transaction(async (tx) => {
    for (const item of outward.items) {
      await adjustStock({
        productId: item.productId,
        branchId: outward.branchId,
        quantity: -item.quantity,
        movementType: 'OUTWARD',
        referenceType: 'STOCK_OUTWARD',
        referenceId: outwardId,
        notes: `Outward ${outward.outwardNo}`,
        createdById: authorizedById,
      });
    }
    await tx.stockOutward.update({
      where: { id: outwardId },
      data: { status: 'COMPLETED', authorizedById, authorizedAt: new Date() },
    });
  });
}

export async function recordPhysicalAudit({ branchId, productId, physicalQty, notes, auditedById }) {
  const auditNo = await generateNumber('AUD', 'physicalStockAudit', 'auditNo');
  const stock = await prisma.stock.findFirst({
    where: { branchId, productId },
    orderBy: { quantity: 'desc' },
  });
  const systemQty = stock?.quantity || 0;
  const physical = parseInt(physicalQty, 10);
  const variance = physical - systemQty;

  const audit = await prisma.physicalStockAudit.create({
    data: {
      auditNo,
      branchId,
      productId,
      systemQty,
      physicalQty: physical,
      variance,
      notes,
      auditedById,
    },
    include: { product: true, branch: true },
  });

  if (variance !== 0) {
    await adjustStock({
      productId,
      branchId,
      quantity: variance,
      movementType: 'ADJUSTMENT',
      referenceType: 'PHYSICAL_AUDIT',
      referenceId: audit.id,
      notes: `Physical audit ${auditNo}`,
      createdById: auditedById,
    });
  }

  return audit;
}
