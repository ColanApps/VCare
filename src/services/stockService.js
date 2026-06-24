import { prisma } from '../lib/prisma.js';
import { getWarehouseBranch } from './warehouseService.js';

export async function adjustStock({ productId, branchId, quantity, batchNo = 'BATCH001', movementType, referenceType, referenceId, notes, createdById }) {
  const existing = await prisma.stock.findUnique({
    where: { productId_branchId_batchNo: { productId, branchId, batchNo } },
  });

  const newQty = (existing?.quantity || 0) + quantity;
  if (newQty < 0) throw new Error('Insufficient stock');

  await prisma.stock.upsert({
    where: { productId_branchId_batchNo: { productId, branchId, batchNo } },
    create: { productId, branchId, batchNo, quantity: newQty },
    update: { quantity: newQty },
  });

  await prisma.stockMovement.create({
    data: {
      productId,
      branchId,
      movementType,
      quantity,
      batchNo,
      referenceType,
      referenceId,
      notes,
      createdById,
    },
  });

  return newQty;
}

export async function receiveGrnStock({ grnId, poId, branchId, items, createdById, skipItemCreate = false }) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: true },
  });
  if (!po) throw new Error('Purchase order not found');
  if (!items?.length) throw new Error('No items to receive');

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const poItem = po.items.find((i) => i.productId === item.productId);
      if (!poItem) continue;

      const batchNo = item.batchNo || 'BATCH001';
      await adjustStockInTx(tx, {
        productId: item.productId,
        branchId,
        quantity: parseInt(item.quantity, 10),
        batchNo,
        movementType: 'GRN_RECEIPT',
        referenceType: 'GRN',
        referenceId: grnId,
        createdById,
      });

      if (!skipItemCreate) {
        await tx.gRNItem.create({
          data: { grnId, productId: item.productId, quantity: parseInt(item.quantity, 10), batchNo, branchId },
        });
      }

      await tx.pOItem.update({
        where: { id: poItem.id },
        data: { received: poItem.received + parseInt(item.quantity, 10) },
      });
    }

    const updatedItems = await tx.pOItem.findMany({ where: { poId } });
    const allReceived = updatedItems.every((i) => i.received >= i.quantity);
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: allReceived ? 'RECEIVED' : 'PARTIAL' },
    });
  });
}

export async function fulfillIndent({ indentId, createdById }) {
  const indent = await prisma.indent.findUnique({
    where: { id: indentId },
    include: { items: { include: { product: true } }, branch: true },
  });
  if (!indent || indent.status !== 'APPROVED') throw new Error('Indent not approved');

  const warehouseBranch = await getWarehouseBranch();
  const sourceBranchId = warehouseBranch?.id || indent.branchId;

  return prisma.$transaction(async (tx) => {
    for (const item of indent.items) {
      const needed = item.quantity - item.fulfilled;
      if (needed <= 0) continue;

      await adjustStockInTx(tx, {
        productId: item.productId,
        branchId: sourceBranchId,
        quantity: -needed,
        movementType: 'INDENT_FULFILL',
        referenceType: 'INDENT',
        referenceId: indentId,
        notes: `Indent ${indent.indentNo} fulfillment`,
        createdById,
      });

      await adjustStockInTx(tx, {
        productId: item.productId,
        branchId: indent.branchId,
        quantity: needed,
        movementType: 'INWARD',
        referenceType: 'INDENT',
        referenceId: indentId,
        notes: `Received via indent ${indent.indentNo}`,
        createdById,
      });

      await tx.indentItem.update({
        where: { id: item.id },
        data: { fulfilled: item.quantity },
      });
    }

    await tx.indent.update({
      where: { id: indentId },
      data: { status: 'FULFILLED' },
    });
  });
}

export async function recordClinicalConsumption({ branchId, productId, quantity, customerId, procedureId, notes, consumedById }) {
  const result = await prisma.$transaction(async (tx) => {
    await adjustStockInTx(tx, {
      productId,
      branchId,
      quantity: -quantity,
      movementType: 'CONSUMPTION',
      referenceType: 'CLINICAL',
      referenceId: procedureId || customerId,
      notes,
      createdById: consumedById,
    });

    return tx.clinicalConsumption.create({
      data: { branchId, productId, quantity, customerId, procedureId, notes, consumedById },
    });
  });

  const { checkReorderAfterConsumption } = await import('./supplyChainOrchestrationService.js');
  await checkReorderAfterConsumption({
    branchId,
    productId,
    quantity,
    createdById: consumedById,
    procedureId,
  }).catch(() => {});

  return result;
}

async function adjustStockInTx(tx, params) {
  const { productId, branchId, quantity, batchNo = 'BATCH001', movementType, referenceType, referenceId, notes, createdById } = params;

  const existing = await tx.stock.findUnique({
    where: { productId_branchId_batchNo: { productId, branchId, batchNo } },
  });

  const newQty = (existing?.quantity || 0) + quantity;
  if (newQty < 0) throw new Error(`Insufficient stock for product ${productId}`);

  await tx.stock.upsert({
    where: { productId_branchId_batchNo: { productId, branchId, batchNo } },
    create: { productId, branchId, batchNo, quantity: newQty },
    update: { quantity: newQty },
  });

  await tx.stockMovement.create({
    data: { productId, branchId, movementType, quantity, batchNo, referenceType, referenceId, notes, createdById },
  });

  return newQty;
}

export async function getStockMovements(branchId, limit = 50) {
  return prisma.stockMovement.findMany({
    where: branchId ? { branchId } : {},
    include: { product: true, branch: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function createStockTransfer({ fromBranchId, toBranchId, items, notes, createdById }) {
  const { generateNumber } = await import('../utils/helpers.js');
  const transferNo = await generateNumber('STO', 'stockTransfer', 'transferNo');

  return prisma.stockTransfer.create({
    data: {
      transferNo,
      fromBranchId,
      toBranchId,
      status: 'PENDING',
      notes,
      createdById,
      items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
    },
    include: { items: { include: { product: true } }, fromBranch: true, toBranch: true },
  });
}

export async function approveStockTransfer(transferId, approvedById) {
  return prisma.stockTransfer.update({
    where: { id: transferId },
    data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
  });
}

export async function completeStockTransfer(transferId, createdById) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });
  if (!transfer || transfer.status !== 'APPROVED') throw new Error('Transfer not approved');

  for (const item of transfer.items) {
    await adjustStock({
      productId: item.productId,
      branchId: transfer.fromBranchId,
      quantity: -item.quantity,
      movementType: 'OUTWARD',
      referenceType: 'STO',
      referenceId: transferId,
      notes: `STO ${transfer.transferNo} to branch`,
      createdById,
    });
    await adjustStock({
      productId: item.productId,
      branchId: transfer.toBranchId,
      quantity: item.quantity,
      movementType: 'INWARD',
      referenceType: 'STO',
      referenceId: transferId,
      notes: `STO ${transfer.transferNo} from branch`,
      createdById,
    });
    await prisma.stockTransferItem.update({
      where: { id: item.id },
      data: { transferred: item.quantity },
    });
  }

  return prisma.stockTransfer.update({
    where: { id: transferId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
}
