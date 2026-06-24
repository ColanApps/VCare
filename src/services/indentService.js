import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { onIndentApproved } from './supplyChainOrchestrationService.js';

export async function createIndent({
  branchId,
  type = 'BILLABLE',
  items,
  createdById,
  notes,
  sourceType = 'MANUAL',
  triggerRef,
  autoApprove = false,
}) {
  if (!items?.length) throw new Error('Indent requires at least one item');

  const indentNo = await generateNumber('IND', 'indent', 'indentNo');
  const indent = await prisma.indent.create({
    data: {
      indentNo,
      branchId,
      type,
      status: autoApprove ? 'APPROVED' : 'PENDING',
      createdById,
      notes,
      sourceType,
      triggerRef,
      ...(autoApprove ? { approvedById: createdById, approvedAt: new Date() } : {}),
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      },
    },
    include: { items: { include: { product: true } }, branch: true },
  });

  if (autoApprove) {
    await onIndentApproved({ indentId: indent.id, authorizedById: createdById }).catch(() => {});
  }

  return indent;
}

export async function appendOrCreateAutoIndent({ branchId, productId, quantity, createdById, triggerRef }) {
  const pending = await prisma.indent.findFirst({
    where: {
      branchId,
      status: 'PENDING',
      sourceType: 'AUTO_REORDER',
      items: { some: { productId } },
    },
    include: { items: true },
  });

  if (pending) {
    const item = pending.items.find((i) => i.productId === productId);
    if (item) {
      await prisma.indentItem.update({
        where: { id: item.id },
        data: { quantity: item.quantity + quantity },
      });
    } else {
      await prisma.indentItem.create({
        data: { indentId: pending.id, productId, quantity },
      });
    }
    return prisma.indent.findUnique({
      where: { id: pending.id },
      include: { items: { include: { product: true } } },
    });
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  const reorderQty = Math.max(quantity, (product?.reorderLevel || 10));

  return createIndent({
    branchId,
    type: 'CLINICAL',
    items: [{ productId, quantity: reorderQty }],
    createdById,
    notes: `Auto-reorder: stock below reorder level`,
    sourceType: 'AUTO_REORDER',
    triggerRef,
    autoApprove: false,
  });
}
