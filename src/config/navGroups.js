/**
 * Resolves a registry screen into a sidebar subgroup label.
 */
export function resolveNavGroup(screen) {
  if (screen.navGroup) return screen.navGroup;
  const p = screen.path;

  if (screen.module === 'dashboard') {
    if (p.includes('/inflow')) return 'Inflow Sales';
    if (p.includes('/heads') || p.includes('/day-sales')) return 'Heads & Day Sales';
    if (p.includes('/highest-sales')) return 'Highest Sales';
    if (p.includes('/branch')) return 'Branch Analytics';
    if (p.includes('/treatment') || p.includes('/visits') || p.includes('/before-after')) return 'Treatment & Visits';
    if (p.includes('/po-authorization')) return 'Purchase';
    return 'Dashboard';
  }

  if (screen.module === 'master') {
    if (p.includes('/targets') || p.includes('/call-center')) return 'Targets & CC Masters';
    if (p.includes('/courier') || p.includes('/transporter') || p.includes('/delivery') || p.includes('/kit')) return 'Logistics & Kits';
    if (p.includes('/ot') || p.includes('/banner') || p.includes('/clinical') || p.includes('/therapist') || p.includes('/procedure-consumption')) return 'Clinical Masters';
    return 'Reference Masters';
  }

  if (screen.module === 'customer') {
    if (p.includes('/treatment')) return 'Treatment & Tests';
    if (p.includes('/inactive') || p.includes('/refund') || p.includes('/joined')) return 'Customer Status';
    return 'Customer';
  }

  if (screen.module === 'appointments') {
    if (p.includes('/procedures')) return 'Procedures';
    if (p.includes('/fix-new') || p.includes('/online') || p.includes('/consultant')) return 'Scheduling';
    return 'Appointments';
  }

  if (screen.module === 'callcenter') {
    if (p.includes('/follow-ups')) return 'Follow-Ups';
    if (p.includes('/dialer')) return 'Dialer';
    return 'Call Center';
  }

  if (screen.module === 'billing') {
    if (p.includes('/pharmacy')) return 'Pharmacy';
    if (p.includes('/loans') || p.includes('/installments')) return 'Loans & Installments';
    if (p.includes('/archive') || p.includes('/cancel')) return 'Bill Maintenance';
    return 'Billing';
  }

  if (screen.module === 'sales') {
    if (p.includes('/challans')) return 'Delivery Challans';
    if (p.includes('/invoices')) return 'Invoices';
    return 'Sales Orders';
  }

  if (screen.module === 'inventory') {
    if (p.includes('/inward')) return 'Stock Inward';
    if (p.includes('/assets') || p.includes('/asset')) return 'Assets';
    if (p.includes('/masters')) return 'Inventory Masters';
    if (p.includes('/warehouse')) return 'Warehouse Transfers';
    if (p.includes('/clinical-consumption')) return 'Clinical';
    if (p.includes('/stock-outward') || p.includes('/outward')) return 'Stock Outward';
    if (p.includes('/physical')) return 'Physical Stock';
    return 'Stock Reports';
  }

  if (screen.module === 'purchase') {
    if (p.includes('/aesthetics')) return 'Aesthetics';
    if (p.includes('/factory')) return 'Factory & Indent';
    if (p.includes('/asset')) return 'Asset Purchase';
    if (p.includes('/batches')) return 'Batch Master';
    if (p.includes('/work-orders')) return 'Work Orders';
    if (p.includes('/grn')) return 'GRN';
    if (p.includes('/transporter') || p.includes('/delivery')) return 'Logistics';
    return 'Purchase';
  }

  if (screen.module === 'operations') {
    if (p.includes('/iou') || p.includes('/reimbursement')) return 'IOU & Reimbursement';
    if (p.includes('/petty')) return 'Petty Cash';
    if (p.includes('/dtr')) return 'DTR';
    if (p.includes('/manpower') || p.includes('/new-joinee')) return 'HR & Manpower';
    if (p.includes('/investment')) return 'Investment';
    if (p.includes('/documents')) return 'Documents';
    if (p.includes('/hma') || p.includes('/it-assets') || p.includes('/issues')) return 'Support & Assets';
    return 'Operations';
  }

  if (screen.module === 'reports') {
    if (p.includes('/meetings/')) return 'Meeting Reports';
    if (p.includes('/gst/sac')) return 'GST — SAC';
    if (p.includes('/gst/')) return 'GST — HSN';
    if (p.includes('/incentives/')) return 'Incentive Reports';
    if (p.includes('/call-audit') || p.includes('/call-center/')) return 'Call Center Reports';
    if (p.includes('/tracking/')) return 'Tracking Reports';
    if (p.includes('/customers/') || p.includes('/treatment/')) return 'Customer & Treatment';
    if (p.includes('/sales/')) return 'Sales Reports';
    if (p.includes('/stock') || p.includes('/closing') || p.includes('/clinical-consumption')) return 'Inventory Reports';
    return 'Reports';
  }

  if (screen.module === 'portal') return 'Portals';
  if (screen.module === 'warehouse') return 'Warehouse';
  if (screen.module === 'admin') return 'Administration';

  return 'More';
}

export const GROUP_ORDER = [
  'Inflow Sales', 'Heads & Day Sales', 'Highest Sales', 'Branch Analytics', 'Treatment & Visits',
  'Dashboard', 'Clinical Masters', 'Targets & CC Masters', 'Logistics & Kits', 'Reference Masters',
  'Treatment & Tests', 'Customer Status', 'Scheduling', 'Procedures',
  'Follow-Ups', 'Dialer', 'Call Center', 'Pharmacy', 'Loans & Installments', 'Bill Maintenance', 'Billing',
  'Sales Orders', 'Delivery Challans', 'Invoices', 'Stock Inward', 'Stock Outward', 'Physical Stock',
  'Inventory Masters', 'Assets', 'Warehouse Transfers', 'Stock Reports', 'Clinical',
  'GRN', 'Work Orders', 'Aesthetics', 'Factory & Indent', 'Asset Purchase', 'Batch Master', 'Logistics', 'Purchase',
  'IOU & Reimbursement', 'Petty Cash', 'DTR', 'HR & Manpower', 'Investment', 'Documents', 'Support & Assets', 'Operations',
  'Sales Reports', 'Customer & Treatment', 'Tracking Reports', 'Call Center Reports', 'Incentive Reports',
  'GST — HSN', 'GST — SAC', 'Meeting Reports', 'Inventory Reports', 'Reports',
  'Portals', 'Warehouse', 'Administration', 'More',
];

export function sortGroupNames(names) {
  return [...names].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

export function flattenNavChildren(children = []) {
  const paths = [];
  for (const item of children) {
    if (item.isGroup) {
      for (const sub of item.children || []) paths.push(sub.path.split('?')[0]);
    } else if (item.path) {
      paths.push(item.path.split('?')[0]);
    }
  }
  return paths;
}

export function findNavItem(children, cleanPath) {
  let best = null;
  let bestLen = -1;

  function consider(item) {
    if (!item?.path) return;
    const itemPath = item.path.split('?')[0];
    const matches = cleanPath === itemPath || cleanPath.startsWith(`${itemPath}/`);
    if (matches && itemPath.length > bestLen) {
      best = item;
      bestLen = itemPath.length;
    }
  }

  for (const item of children) {
    if (item.isGroup) {
      for (const sub of item.children || []) consider(sub);
    } else {
      consider(item);
    }
  }
  return best;
}
