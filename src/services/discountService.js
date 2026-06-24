import { prisma } from '../lib/prisma.js';

export async function getApplicableDiscount({ type, category, targetId, lineAmount }) {
  const now = new Date();
  const rules = await prisma.discountRule.findMany({
    where: {
      type,
      isActive: true,
      OR: [{ category }, { category: 'ALL' }],
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      ],
    },
    orderBy: { discountPercent: 'desc' },
  });

  let best = rules.find((r) => r.targetScope === 'SPECIFIC' && r.targetId === targetId);
  if (!best) best = rules.find((r) => r.targetScope === 'ALL');

  if (!best) {
    const scheme = await prisma.schemeOffer.findFirst({
      where: {
        itemType: type,
        isActive: true,
        validFrom: { lte: now },
        validTo: { gte: now },
        AND: [
          { OR: [{ category }, { category: 'ALL' }] },
          { OR: [{ itemCode: null }, { itemCode: targetId }] },
        ],
      },
      orderBy: { discountPercent: 'desc' },
    });
    if (!scheme) return { percent: 0, amount: 0, source: null };
    const amount = Math.min(lineAmount * (scheme.discountPercent / 100), lineAmount);
    return { percent: scheme.discountPercent, amount, source: `Scheme: ${scheme.name}` };
  }

  const cap = await prisma.maxDiscountLimit.findUnique({
    where: { type_category: { type, category: category === 'ALL' ? 'ALL' : category } },
  });

  let percent = best.discountPercent;
  if (cap && percent > cap.maxPercent) percent = cap.maxPercent;

  let amount = lineAmount * (percent / 100);
  if (best.maxAmount && amount > best.maxAmount) amount = best.maxAmount;

  return { percent, amount, source: best.name };
}

export async function applyDiscountsToItems(items, customerCategory = 'ALL') {
  const result = [];
  for (const item of items) {
    const type = ['TREATMENT', 'SERVICE'].includes(item.itemType) ? 'SERVICE' : 'PRODUCT';
    const category = item.category || customerCategory || 'ALL';
    const lineAmount = (item.quantity || 1) * (item.unitPrice || 0);
    const disc = await getApplicableDiscount({ type, category, targetId: item.itemCode, lineAmount });
    result.push({
      ...item,
      discount: disc.amount,
      discountSource: disc.source,
      discountPercent: disc.percent,
    });
  }
  return result;
}

export async function listDiscountRules() {
  return prisma.discountRule.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function listSchemeOffers() {
  return prisma.schemeOffer.findMany({ orderBy: { validFrom: 'desc' } });
}

export async function listMaxDiscountLimits() {
  return prisma.maxDiscountLimit.findMany();
}
