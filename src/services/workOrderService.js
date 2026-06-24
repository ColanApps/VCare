import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';

export async function createWorkOrder({ branchId, vendorId, description, notes, items, createdById, indentId }) {
  const woNo = await generateNumber('WO', 'workOrder', 'woNo');
  return prisma.workOrder.create({
    data: {
      woNo,
      branchId,
      vendorId: vendorId || null,
      indentId: indentId || null,
      description,
      notes,
      status: 'PENDING_AUTH',
      createdById,
      items: {
        create: items.map((i) => ({
          productId: i.productId || null,
          description: i.description || null,
          quantity: parseInt(i.quantity, 10) || 1,
          unitCost: parseFloat(i.unitCost) || 0,
        })),
      },
    },
    include: { items: { include: { product: true } }, branch: true, vendor: true },
  });
}

export async function authorizeWorkOrder({ workOrderId, action, authorizedById }) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!wo || wo.status !== 'PENDING_AUTH') throw new Error('Work order not pending authorization');
  return prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      status: action === 'approve' ? 'APPROVED' : 'CANCELLED',
      authorizedById,
      authorizedAt: new Date(),
    },
    include: { items: { include: { product: true } }, branch: true, vendor: true },
  });
}

export async function completeWorkOrder(workOrderId, completedById) {
  const wo = await prisma.workOrder.update({
    where: { id: workOrderId },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: { items: { include: { product: true } }, branch: true, vendor: true, indent: true },
  });

  if (completedById) {
    const { onWorkOrderCompleted } = await import('./supplyChainOrchestrationService.js');
    await onWorkOrderCompleted({ workOrderId, completedById }).catch(() => {});
  }

  return wo;
}
