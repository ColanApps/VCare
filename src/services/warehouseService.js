import { prisma } from '../lib/prisma.js';

export async function getWarehouseBranch() {
  return prisma.branch.findFirst({
    where: { OR: [{ type: 'WAREHOUSE' }, { code: { startsWith: 'WH-' } }], isActive: true },
  });
}

export async function getWarehouseDashboard() {
  const warehouse = await getWarehouseBranch();
  if (!warehouse) return { warehouse: null, stats: null, pendingIndents: [], pendingTransfers: [], lowStock: [] };

  const [stockAgg, productCount, pendingIndents, pendingTransfers, lowStock, recentMovements] = await Promise.all([
    prisma.stock.aggregate({ where: { branchId: warehouse.id }, _sum: { quantity: true }, _count: true }),
    prisma.stock.groupBy({ by: ['productId'], where: { branchId: warehouse.id, quantity: { gt: 0 } } }),
    prisma.indent.findMany({
      where: { status: 'APPROVED' },
      include: { branch: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.stockTransfer.findMany({
      where: { fromBranchId: warehouse.id, status: { in: ['PENDING', 'APPROVED'] } },
      include: { toBranch: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.stock.findMany({
      where: { branchId: warehouse.id, quantity: { gt: 0 } },
      include: { product: true },
      orderBy: { quantity: 'asc' },
      take: 100,
    }),
    prisma.stockMovement.findMany({
      where: { branchId: warehouse.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);

  return {
    warehouse,
    stats: {
      totalUnits: stockAgg._sum.quantity || 0,
      skuCount: productCount.length,
      stockLines: stockAgg._count,
      pendingDispatch: pendingIndents.length + pendingTransfers.length,
    },
    pendingIndents,
    pendingTransfers,
    lowStock: lowStock.filter((s) => s.quantity <= (s.product?.reorderLevel ?? 10)).slice(0, 15),
    recentMovements,
  };
}

export async function getWarehouseStock() {
  const warehouse = await getWarehouseBranch();
  if (!warehouse) return { warehouse: null, stocks: [] };

  const stocks = await prisma.stock.findMany({
    where: { branchId: warehouse.id, quantity: { gt: 0 } },
    include: { product: true },
    orderBy: { product: { name: 'asc' } },
  });

  return { warehouse, stocks };
}
