import { startOfMonth, endOfMonth, startOfDay, endOfDay, parseISO } from 'date-fns';

export function parseReportPeriod(query = {}) {
  const now = new Date();
  const month = parseInt(query.month, 10) || now.getMonth() + 1;
  const year = parseInt(query.year, 10) || now.getFullYear();

  if (query.from && query.to) {
    return {
      month,
      year,
      from: startOfDay(parseISO(query.from)),
      to: endOfDay(parseISO(query.to)),
    };
  }

  if (query.date) {
    const d = parseISO(query.date);
    return { month, year, from: startOfDay(d), to: endOfDay(d), date: d };
  }

  const from = startOfMonth(new Date(year, month - 1));
  const to = endOfMonth(new Date(year, month - 1));
  return { month, year, from, to };
}

export function branchWhere(branchFilter, branchId) {
  if (branchId) return { branchId };
  return branchFilter || {};
}
