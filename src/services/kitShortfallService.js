import { prisma } from '../lib/prisma.js';
import { resolveProcedureConsumptions } from './clinicalProcedureService.js';

export async function getLowStockByReorder(branchFilter = {}) {
  const stocks = await prisma.stock.findMany({
    where: branchFilter,
    include: { product: true, branch: true },
  });
  return stocks
    .filter((s) => s.quantity <= (s.product?.reorderLevel ?? 10))
    .map((s) => ({
      productId: s.productId,
      productName: s.product?.name,
      sku: s.product?.sku,
      branchId: s.branchId,
      branchName: s.branch?.name,
      onHand: s.quantity,
      reorderLevel: s.product?.reorderLevel ?? 10,
      shortfall: Math.max(0, (s.product?.reorderLevel ?? 10) - s.quantity),
    }))
    .sort((a, b) => a.onHand - b.onHand);
}

async function branchStockMap(branchId) {
  const rows = await prisma.stock.findMany({ where: { branchId } });
  const map = new Map();
  for (const r of rows) {
    map.set(r.productId, (map.get(r.productId) || 0) + r.quantity);
  }
  return map;
}

async function kitDemandFromMappings() {
  const kits = await prisma.kitMapping.findMany({ where: { isActive: true } });
  const demands = [];
  for (const kit of kits) {
    let items = [];
    try {
      items = JSON.parse(kit.itemsJson);
    } catch {
      continue;
    }
    for (const item of items) {
      if (!item.productId) continue;
      demands.push({
        kitCode: kit.kitCode,
        kitName: kit.name,
        productId: item.productId,
        quantity: item.qty || item.quantity || 1,
      });
    }
  }
  return demands;
}

export async function getKitShortfalls(branchId) {
  const stock = await branchStockMap(branchId);
  const kitDemands = await kitDemandFromMappings();
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(kitDemands.map((d) => d.productId))] } },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const byKit = new Map();
  for (const d of kitDemands) {
    const onHand = stock.get(d.productId) || 0;
    const required = d.quantity;
    if (onHand >= required) continue;
    const key = d.kitCode;
    if (!byKit.has(key)) {
      byKit.set(key, { kitCode: d.kitCode, kitName: d.kitName, items: [] });
    }
    const product = productMap[d.productId];
    byKit.get(key).items.push({
      productId: d.productId,
      productName: product?.name || d.productId,
      sku: product?.sku,
      required,
      onHand,
      shortfall: required - onHand,
    });
  }

  return [...byKit.values()].filter((k) => k.items.length > 0);
}

export async function getProcedureKitShortfalls(procedureId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: { treatment: true, appointment: true, customer: true },
  });
  if (!procedure) return [];

  const branchId = procedure.branchId || procedure.customer.branchId;
  const stock = await branchStockMap(branchId);

  const latestSlip = await prisma.treatmentSlip.findFirst({
    where: { customerId: procedure.customerId },
    orderBy: { createdAt: 'desc' },
  });
  const slipTreatments = latestSlip?.treatments ? JSON.parse(latestSlip.treatments) : [];
  const plan = await resolveProcedureConsumptions(procedure, slipTreatments);

  const shortfalls = [];
  for (const row of plan) {
    const onHand = stock.get(row.productId) || 0;
    if (onHand < row.quantity) {
      shortfalls.push({
        procedureId,
        procedureNo: procedure.procedureNo,
        productId: row.productId,
        productName: row.product?.name,
        required: row.quantity,
        onHand,
        shortfall: row.quantity - onHand,
        procedureType: row.procedureType,
      });
    }
  }
  return shortfalls;
}

export async function getUpcomingProcedureShortfalls(branchFilter = {}, limit = 30) {
  const procedures = await prisma.procedure.findMany({
    where: {
      status: { in: ['BOOKED', 'IN_PROGRESS'] },
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
    },
    include: { customer: true, treatment: true },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });

  const results = [];
  for (const p of procedures) {
    const shortfalls = await getProcedureKitShortfalls(p.id);
    if (shortfalls.length) {
      results.push({
        procedure: p,
        shortfalls,
        totalShortfall: shortfalls.reduce((s, x) => s + x.shortfall, 0),
      });
    }
  }
  return results;
}
