import { prisma } from '../lib/prisma.js';
import { startOfDay, endOfDay } from 'date-fns';

export async function recordPunch({ userId, branchId, punchType, deviceId, source, notes }) {
  return prisma.biometricLog.create({
    data: {
      userId,
      branchId,
      punchType,
      deviceId: deviceId || null,
      source: source || 'MANUAL',
      notes: notes || null,
    },
    include: { user: true, branch: true },
  });
}

export async function getTodayAttendance(branchFilter = {}) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const logs = await prisma.biometricLog.findMany({
    where: {
      punchedAt: { gte: todayStart, lte: todayEnd },
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
    },
    include: { user: { include: { role: true, designation: true } }, branch: true },
    orderBy: { punchedAt: 'desc' },
  });

  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
    },
    include: { role: true, branch: true },
  });

  const present = new Set(logs.filter((l) => l.punchType === 'IN').map((l) => l.userId));
  const absent = staff.filter((s) => !present.has(s.id));

  return { logs, staff, presentCount: present.size, absentCount: absent.length, absent };
}

export async function getAttendanceSummary(branchFilter = {}, days = 7) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const logs = await prisma.biometricLog.groupBy({
    by: ['userId', 'punchType'],
    where: {
      punchedAt: { gte: from },
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
    },
    _count: true,
  });
  return logs;
}
