import { prisma } from '../lib/prisma.js';
import { getWarehouseBranch } from './warehouseService.js';
import { createWorkOrder } from './workOrderService.js';
import { fulfillIndent } from './stockService.js';

async function getWarehouseStock(productId, warehouseBranchId) {
  const rows = await prisma.stock.findMany({
    where: { productId, branchId: warehouseBranchId },
  });
  return rows.reduce((s, r) => s + r.quantity, 0);
}

export async function checkReorderAfterConsumption({ branchId, productId, quantity, createdById, procedureId }) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const stockRows = await prisma.stock.findMany({ where: { productId, branchId } });
  const onHand = stockRows.reduce((s, r) => s + r.quantity, 0);
  const reorderLevel = product.reorderLevel ?? 10;

  if (onHand > reorderLevel) return null;

  const { appendOrCreateAutoIndent } = await import('./indentService.js');
  return appendOrCreateAutoIndent({
    branchId,
    productId,
    quantity: Math.max(reorderLevel - onHand + quantity, 1),
    createdById,
    triggerRef: procedureId || `consumption-${productId}`,
  });
}

export async function onIndentApproved({ indentId, authorizedById }) {
  const indent = await prisma.indent.findUnique({
    where: { id: indentId },
    include: { items: { include: { product: true } }, workOrder: true },
  });
  if (!indent || indent.status !== 'APPROVED') return null;
  if (indent.workOrder) return indent.workOrder;

  const warehouse = await getWarehouseBranch();
  const warehouseId = warehouse?.id;
  if (!warehouseId) return null;

  const needsProduction = [];
  for (const item of indent.items) {
    const whQty = await getWarehouseStock(item.productId, warehouseId);
    const needed = item.quantity - item.fulfilled;
    if (needed > 0 && whQty < needed) {
      needsProduction.push({
        productId: item.productId,
        quantity: needed - whQty,
        description: item.product?.name,
      });
    }
  }

  if (!needsProduction.length) {
    try {
      await fulfillIndent({ indentId, createdById: authorizedById });
    } catch {
      // warehouse may fulfill later via dispatch queue
    }
    return null;
  }

  const vendor = await prisma.vendor.findFirst({ where: { isActive: true, type: 'CLINICAL' } })
    || await prisma.vendor.findFirst({ where: { isActive: true } });

  const wo = await createWorkOrder({
    branchId: warehouseId,
    vendorId: vendor?.id,
    description: `FMCG/Production for indent ${indent.indentNo}`,
    notes: `Auto work order — warehouse shortfall for branch ${indent.branchId}`,
    items: needsProduction.map((i) => ({
      productId: i.productId,
      description: i.description,
      quantity: i.quantity,
      unitCost: 0,
    })),
    createdById: authorizedById,
    indentId,
  });

  return wo;
}

export async function onWorkOrderCompleted({ workOrderId, completedById }) {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: { items: { include: { product: true } }, indent: { include: { items: true } } },
  });
  if (!wo || wo.status !== 'COMPLETED') return wo;

  const warehouse = await getWarehouseBranch();
  const warehouseId = warehouse?.id || wo.branchId;
  const { adjustStock } = await import('./stockService.js');

  for (const item of wo.items) {
    if (!item.productId) continue;
    await adjustStock({
      productId: item.productId,
      branchId: warehouseId,
      quantity: item.quantity,
      movementType: 'INWARD',
      referenceType: 'WORK_ORDER',
      referenceId: wo.id,
      notes: `Production complete — WO ${wo.woNo}`,
      createdById: completedById,
    });
  }

  if (wo.indent && wo.indent.status === 'APPROVED') {
    try {
      await fulfillIndent({ indentId: wo.indent.id, createdById: completedById });
    } catch {
      // dispatch queue will pick up approved indent
    }
  }

  return wo;
}
