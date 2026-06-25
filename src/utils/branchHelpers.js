/**
 * Shared branch resolution and list filters for multi-branch ERP CRUD.
 * Prevents records being saved under the wrong branch and missing from scoped lists.
 */

export function resolveBranchId({ bodyBranchId, userBranchId, customerBranchId }) {
  const branchId = bodyBranchId || userBranchId || customerBranchId;
  if (!branchId) {
    throw new Error('Branch is required. Select a branch or pick a customer that belongs to a branch.');
  }
  return branchId;
}

export function showBranchPickerFor(user) {
  return !user?.branchId || ['SUPER_ADMIN', 'CORPORATE'].includes(user?.roleCode);
}

/** Bills, appointments, sales orders, etc. — match branchId OR customer's branch. */
export function branchEntityListWhere(branchFilter = {}, { customerPath = 'customer' } = {}) {
  if (!branchFilter?.branchId) return {};
  return {
    OR: [
      { branchId: branchFilter.branchId },
      { [customerPath]: { branchId: branchFilter.branchId } },
    ],
  };
}

/** Customers, stock at branch, etc. — filter on branchId field directly. */
export function directBranchWhere(branchFilter = {}) {
  if (!branchFilter?.branchId) return {};
  return { branchId: branchFilter.branchId };
}

export function combineWhere(...clauses) {
  const parts = clauses.filter((c) => c && Object.keys(c).length > 0);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function formatDateQueryParam(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
