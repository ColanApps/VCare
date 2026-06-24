import { prisma } from '../lib/prisma.js';
import { startOfDay, endOfDay } from 'date-fns';

export async function resolveProcedurePerformer({
  branchId,
  treatmentId,
  scheduledAt,
  performerId,
}) {
  if (performerId) return performerId;

  const treatment = treatmentId
    ? await prisma.treatment.findUnique({ where: { id: treatmentId } })
    : null;
  const category = treatment?.category || 'HAIR';
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  const from = startOfDay(when);
  const to = endOfDay(when);

  const therapists = await prisma.therapist.findMany({
    where: {
      isActive: true,
      OR: [{ branchId }, { branchId: null }],
    },
    orderBy: { name: 'asc' },
  });

  const specialtyMatch = therapists.filter((t) => {
    if (!t.specialty) return true;
    return t.specialty.toUpperCase().includes(category)
      || category.includes(t.specialty.toUpperCase());
  });

  for (const t of specialtyMatch) {
    const parts = t.name.trim().split(/\s+/);
    const user = await prisma.user.findFirst({
      where: {
        isActive: true,
        branchId,
        firstName: parts[0],
        lastName: parts.slice(1).join(' ') || parts[0],
      },
    });
    if (user) {
      const load = await prisma.procedure.count({
        where: {
          performerId: user.id,
          scheduledAt: { gte: from, lte: to },
          status: { notIn: ['CANCELLED'] },
        },
      });
      if (load < 8) return user.id;
    }
  }

  const consultants = await prisma.user.findMany({
    where: {
      isActive: true,
      branchId,
      role: { code: { in: ['THERAPIST', 'CONSULTANT', 'BRANCH_MANAGER'] } },
    },
    include: { role: true },
  });

  let bestId = null;
  let minLoad = Infinity;
  for (const u of consultants) {
    const load = await prisma.procedure.count({
      where: {
        performerId: u.id,
        scheduledAt: { gte: from, lte: to },
        status: { notIn: ['CANCELLED'] },
      },
    });
    const roleBonus = u.role?.code === 'THERAPIST' ? -2 : 0;
    const adjustedLoad = load + roleBonus;
    if (adjustedLoad < minLoad) {
      minLoad = adjustedLoad;
      bestId = u.id;
    }
  }

  return bestId;
}
