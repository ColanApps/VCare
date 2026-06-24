import { prisma } from '../lib/prisma.js';

const counters = new Map();

export async function generateNumber(prefix, model, field) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const count = (counters.get(key) || 0) + 1;
  counters.set(key, count);

  const existing = await prisma[model].count({
    where: {
      [field]: { startsWith: `${prefix}${year}` },
    },
  });

  const seq = String(Math.max(count, existing + 1)).padStart(5, '0');
  return `${prefix}${year}${seq}`;
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDate(date, options = {}) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(date));
}

export function formatDateTime(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getStatusColor(status) {
  const map = {
    ACTIVE: 'success',
    SCHEDULED: 'info',
    CONFIRMED: 'info',
    COMPLETED: 'success',
    PAID: 'success',
    PENDING: 'warning',
    PARTIAL: 'warning',
    DRAFT: 'neutral',
    CANCELLED: 'danger',
    REJECTED: 'danger',
    OPEN: 'info',
    IN_PROGRESS: 'warning',
    APPROVED: 'success',
    RESOLVED: 'success',
    CLOSED: 'neutral',
    NO_SHOW: 'danger',
    INACTIVE: 'neutral',
  };
  return map[status] || 'neutral';
}

export function paginate(page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(5, parseInt(limit, 10) || 20));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

export function buildPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    from: total === 0 ? 0 : (page - 1) * limit + 1,
    to: Math.min(page * limit, total),
  };
}
