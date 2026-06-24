import { mergeRegistryIntoNavigation, getScreenByPath } from './screenRegistry.js';
import { findNavItem } from './navGroups.js';

const moduleToNavId = {
  master: 'master', customer: 'customer', appointments: 'appointments', callcenter: 'callcenter',
  billing: 'billing', finance: 'finance', sales: 'sales', inventory: 'inventory', purchase: 'purchase',
  warehouse: 'warehouse', operations: 'operations', reports: 'reports', dashboard: 'dashboard',
  portal: 'portal', admin: 'admin',
};

export const navigation = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'layout-dashboard',
    permission: 'dashboard.view',
    children: [
      { label: 'My Tasks', path: '/dashboard/my-tasks', permission: 'dashboard.view' },
      { label: 'Role Home', path: '/dashboard/role-home', permission: 'dashboard.view' },
      { label: 'Executive Overview', path: '/dashboard', permission: 'dashboard.view' },
      { label: 'Inflow Sales', path: '/dashboard/inflow', permission: 'dashboard.inflow' },
      { label: 'Day Sales', path: '/dashboard/day-sales', permission: 'dashboard.sales' },
      { label: 'Branch Report', path: '/dashboard/branch', permission: 'dashboard.branch' },
      { label: 'Treatment Status', path: '/dashboard/treatment', permission: 'dashboard.treatment' },
      { label: 'Biometric', path: '/dashboard/biometric', permission: 'dashboard.biometric' },
      { label: 'Stock Inward', path: '/dashboard/stock-inward', permission: 'dashboard.stock_inward' },
      { label: 'Visits — All', path: '/dashboard/visits', permission: 'dashboard.treatment' },
      { label: 'Before-After Album', path: '/dashboard/before-after-album', permission: 'dashboard.treatment' },
    ],
  },
  {
    id: 'admin',
    label: 'Super Admin',
    icon: 'shield',
    permission: 'admin.view',
    children: [
      { label: 'User Management', path: '/admin/users', permission: 'admin.users' },
      { label: 'Organogram', path: '/admin/organogram', permission: 'admin.organogram' },
      { label: 'Roles & Access', path: '/admin/roles', permission: 'admin.roles' },
      { label: 'IP Whitelist', path: '/admin/ip-whitelist', permission: 'admin.ip' },
      { label: 'Audit Trail', path: '/admin/audit', permission: 'admin.audit' },
      { label: 'Online Orders', path: '/admin/online-orders', permission: 'admin.audit' },
      { label: 'Email Config', path: '/admin/email-config', permission: 'admin.notifications' },
      { label: 'SMS Config', path: '/admin/sms-config', permission: 'admin.notifications' },
    ],
  },
  {
    id: 'master',
    label: 'Master',
    icon: 'database',
    permission: 'master.view',
    children: [
      { label: 'Geography', path: '/master/geography', permission: 'master.geography' },
      { label: 'Branches & Zones', path: '/master/branches', permission: 'master.branches' },
      { label: 'Treatments', path: '/master/treatments', permission: 'master.treatments' },
      { label: 'Diagnosis', path: '/master/diagnosis', permission: 'master.diagnosis' },
      { label: 'Designations', path: '/master/designations', permission: 'master.designations' },
      { label: 'Targets', path: '/master/targets', permission: 'master.targets' },
      { label: 'Discounts & Schemes', path: '/master/discounts', permission: 'master.discounts' },
      { label: 'Reference Data', path: '/master/reference', permission: 'master.reference' },
      { label: 'Courier Master', path: '/master/courier', permission: 'master.reference' },
      { label: 'Clinical Treatments', path: '/master/clinical-treatments', permission: 'master.treatments' },
      { label: 'Tickets', path: '/master/tickets', permission: 'master.tickets' },
    ],
  },
  {
    id: 'customer',
    label: 'Customer',
    icon: 'users',
    permission: 'customer.view',
    children: [
      { label: 'Registration', path: '/customer/register', permission: 'customer.create' },
      { label: 'Search Customer', path: '/customer/search', permission: 'customer.view' },
      { label: 'Schedule Pending', path: '/customer/schedule-pending', permission: 'customer.schedule' },
      { label: 'Consultations', path: '/customer/consultations', permission: 'customer.consult' },
      { label: 'Before/After Photos', path: '/customer/photos', permission: 'customer.photos' },
      { label: 'Visit Details', path: '/customer/treatment/visits', permission: 'customer.treatment' },
      { label: 'Treatment Feedback', path: '/customer/treatment/feedback', permission: 'customer.treatment' },
      { label: 'HMA / DSA Tests', path: '/customer/treatment/tests', permission: 'customer.treatment' },
      { label: 'HMA Status', path: '/customer/treatment/hma-status', permission: 'customer.treatment' },
      { label: 'Refund Complaints', path: '/customer/refund-complaints', permission: 'billing.refunds' },
    ],
  },
  {
    id: 'appointments',
    label: 'Appointments',
    icon: 'calendar',
    permission: 'appointments.view',
    children: [
      { label: 'Add Scheduling', path: '/appointments/create', permission: 'appointments.create' },
      { label: 'View Scheduling', path: '/appointments', permission: 'appointments.view' },
      { label: 'Search', path: '/appointments/search', permission: 'appointments.view' },
      { label: 'Procedure Booking', path: '/appointments/procedures/book', permission: 'appointments.procedures' },
      { label: 'Procedure Calendar', path: '/appointments/procedures', permission: 'appointments.procedures' },
      { label: 'Follow Ups', path: '/appointments/follow-ups', permission: 'appointments.followup' },
      { label: 'Fix New Appointment', path: '/appointments/fix-new', permission: 'appointments.create' },
    ],
  },
  {
    id: 'callcenter',
    label: 'Call Center',
    icon: 'phone',
    permission: 'callcenter.view',
    children: [
      { label: 'Dashboard', path: '/call-center', permission: 'callcenter.view' },
      { label: 'Dialer', path: '/call-center/dialer', permission: 'callcenter.view' },
      { label: 'Follow-Up Search', path: '/call-center/follow-ups', permission: 'callcenter.followup' },
      { label: 'Call Back Search', path: '/call-center/callbacks', permission: 'callcenter.followup' },
      { label: 'Not Joined', path: '/call-center/not-joined', permission: 'callcenter.followup' },
      { label: 'Treatment Booked', path: '/call-center/treatment-booked', permission: 'callcenter.view' },
      { label: 'Treatment Calendar', path: '/call-center/treatment-calendar', permission: 'callcenter.view' },
      { label: 'Pending Session', path: '/call-center/pending-session', permission: 'callcenter.followup' },
      { label: 'Supplements Follow-Up', path: '/call-center/supplements', permission: 'callcenter.followup' },
    ],
  },
  {
    id: 'billing',
    label: 'Bill Details',
    icon: 'receipt',
    permission: 'billing.view',
    children: [
      { label: 'Create Bill', path: '/billing/create', permission: 'billing.create' },
      { label: 'Bill Search', path: '/billing', permission: 'billing.view' },
      { label: 'Payments', path: '/billing/payments', permission: 'billing.payments' },
      { label: 'Advance Receipts', path: '/billing/advances', permission: 'billing.advances' },
      { label: 'Loan & Installments', path: '/billing/loans', permission: 'billing.loans' },
      { label: 'Pharmacy Billing', path: '/billing/pharmacy', permission: 'billing.pharmacy' },
      { label: 'Pharmacy B2B Invoice', path: '/billing/pharmacy-b2b', permission: 'billing.pharmacy.b2b' },
      { label: 'Service B2B Invoice', path: '/billing/service-b2b', permission: 'billing.service.b2b' },
      { label: 'Cash Deposits', path: '/billing/cash-deposits', permission: 'billing.advances' },
      { label: 'Permanent Refunds', path: '/billing/permanent-refunds', permission: 'billing.refunds' },
      { label: 'Refunds & Credit Notes', path: '/billing/credit-notes', permission: 'billing.refunds' },
      { label: 'Installment Hub', path: '/billing/installments', permission: 'billing.installments' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'wallet',
    permission: 'finance.view',
    children: [
      { label: 'Finance Hub', path: '/finance', permission: 'finance.view' },
      { label: 'AR Aging', path: '/finance/ar-aging', permission: 'finance.view' },
      { label: 'Day Close', path: '/finance/day-close', permission: 'finance.close.submit' },
      { label: 'Incentive Payouts', path: '/finance/incentives', permission: 'finance.incentives' },
      { label: 'Advance Audit', path: '/finance/advance-audit', permission: 'finance.view' },
      { label: 'General Ledger', path: '/finance/ledger', permission: 'finance.view' },
      { label: 'GST Export', path: '/finance/gst-export', permission: 'reports.gst' },
      { label: 'Collections Portal', path: '/portal/accounts', permission: 'portal.accounts' },
      { label: 'Loan & EMI', path: '/billing/loans', permission: 'billing.loans' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: 'shopping-cart',
    permission: 'sales.view',
    children: [
      { label: 'Sales Orders', path: '/sales/orders', permission: 'sales.view' },
      { label: 'Create Order', path: '/sales/orders/create', permission: 'sales.create' },
      { label: 'Delivery Challans', path: '/sales/challans', permission: 'sales.view' },
      { label: 'Sales Invoices', path: '/sales/invoices', permission: 'sales.invoice' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'package',
    permission: 'inventory.view',
    children: [
      { label: 'Product Master', path: '/inventory/products', permission: 'inventory.products' },
      { label: 'Billable Stock', path: '/inventory/stock?type=BILLABLE', permission: 'inventory.stock' },
      { label: 'Clinical Stock', path: '/inventory/stock?type=CLINICAL', permission: 'inventory.stock' },
      { label: 'Clinical Consumption', path: '/inventory/clinical-consumption', permission: 'inventory.clinical' },
      { label: 'Stock Movements', path: '/inventory/movements', permission: 'inventory.stock' },
      { label: 'Raise Indent', path: '/inventory/indents/create', permission: 'inventory.indent' },
      { label: 'Indent Search', path: '/inventory/indents', permission: 'inventory.indent' },
      { label: 'Indent Authorization', path: '/inventory/indents/authorize', permission: 'inventory.authorize' },
      { label: 'Stock Transfer (STO)', path: '/inventory/stock-transfers', permission: 'inventory.transfer' },
      { label: 'Stock Outward', path: '/inventory/stock-outward', permission: 'inventory.outward' },
      { label: 'Physical Stock Audit', path: '/inventory/physical-stock', permission: 'inventory.stock' },
      { label: 'Kit Shortfall Alerts', path: '/inventory/kit-shortfall', permission: 'inventory.stock' },
    ],
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    icon: 'warehouse',
    permission: 'warehouse.view',
    children: [
      { label: 'Dashboard', path: '/warehouse', permission: 'warehouse.view' },
      { label: 'Central Stock', path: '/warehouse/stock', permission: 'warehouse.view' },
      { label: 'Dispatch Queue', path: '/warehouse/dispatch', permission: 'warehouse.dispatch' },
    ],
  },
  {
    id: 'portal',
    label: 'Portals',
    icon: 'building-2',
    permission: 'portal.view',
    children: [
      { label: 'Corporate Portal', path: '/portal/corporate', permission: 'portal.corporate' },
      { label: 'Branch Manager Portal', path: '/portal/branch-manager', permission: 'portal.view' },
      { label: 'Warehouse Portal', path: '/portal/warehouse', permission: 'portal.view' },
      { label: 'Accounts Portal', path: '/portal/accounts', permission: 'portal.accounts' },
      { label: 'Consultant Portal', path: '/portal/consultant', permission: 'portal.consultant' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    icon: 'truck',
    permission: 'purchase.view',
    children: [
      { label: 'Vendor Master', path: '/purchase/vendors', permission: 'purchase.vendors' },
      { label: 'Purchase Order', path: '/purchase/orders/create', permission: 'purchase.po' },
      { label: 'PO Search', path: '/purchase/orders', permission: 'purchase.po' },
      { label: 'PO Authorization', path: '/purchase/orders/authorize', permission: 'purchase.authorize' },
      { label: 'GRN', path: '/purchase/grn', permission: 'purchase.grn' },
      { label: 'GRN Pending', path: '/purchase/grn/pending', permission: 'purchase.grn' },
      { label: 'GRN Search', path: '/purchase/grn/search', permission: 'purchase.grn' },
      { label: 'Work Orders', path: '/purchase/work-orders', permission: 'purchase.workorder' },
      { label: 'Aesthetics — Center PO', path: '/purchase/aesthetics/orders', permission: 'purchase.po' },
      { label: 'Aesthetics — GRN', path: '/purchase/aesthetics/grn', permission: 'purchase.grn' },
      { label: 'Aesthetics — Invoice', path: '/purchase/aesthetics/invoices', permission: 'purchase.po' },
      { label: 'Factory Indents', path: '/purchase/factory/indents', permission: 'purchase.po' },
      { label: 'Factory Inward', path: '/purchase/factory/inward', permission: 'purchase.grn' },
      { label: 'Asset PO', path: '/purchase/asset-po/search', permission: 'purchase.authorize' },
      { label: 'Asset GRN', path: '/purchase/asset-grn', permission: 'purchase.grn' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: 'settings',
    permission: 'operations.view',
    children: [
      { label: 'V Support', path: '/operations/tickets', permission: 'operations.tickets' },
      { label: 'IOU Requests', path: '/operations/iou', permission: 'operations.iou' },
      { label: 'IOU Settlement', path: '/operations/iou/settlement', permission: 'operations.iou' },
      { label: 'Petty Cash', path: '/operations/petty-cash', permission: 'operations.petty' },
      { label: 'DTR Entry', path: '/operations/dtr', permission: 'operations.petty' },
      { label: 'Manpower Requisition', path: '/operations/manpower', permission: 'operations.tickets' },
      { label: 'Investment', path: '/operations/investment', permission: 'operations.iou' },
      { label: 'Documents', path: '/operations/documents', permission: 'operations.tickets' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'bar-chart-3',
    permission: 'reports.view',
    children: [
      { label: 'Sales Report', path: '/reports/sales', permission: 'reports.sales' },
      { label: 'Customer Report', path: '/reports/customers', permission: 'reports.customers' },
      { label: 'Consultant Performance', path: '/reports/consultants', permission: 'reports.consultants' },
      { label: 'GST Summary (HSN)', path: '/reports/gst', permission: 'reports.gst' },
      { label: 'GST Report — B2C', path: '/reports/gst-b2c', permission: 'reports.gst' },
      { label: 'GST Report — B2B', path: '/reports/gst-b2b', permission: 'reports.gst' },
      { label: 'Day Wise GST', path: '/reports/gst-daywise', permission: 'reports.gst' },
      { label: 'Branch Comparison', path: '/reports/branch-comparison', permission: 'reports.branches' },
      { label: 'Inventory Aging', path: '/reports/inventory-aging', permission: 'reports.inventory' },
      { label: 'Target Achievement', path: '/reports/targets', permission: 'reports.targets' },
      { label: 'Pending Advances', path: '/reports/pending-advances', permission: 'reports.sales' },
      { label: 'Loan Report', path: '/reports/loans', permission: 'reports.sales' },
      { label: 'Product/Service Sales', path: '/reports/product-service-sales', permission: 'reports.sales' },
      { label: 'Refund & Credit Notes', path: '/reports/refunds', permission: 'reports.sales' },
      { label: 'Branch Collection', path: '/reports/collection', permission: 'reports.sales' },
      { label: 'Discontinued Clients', path: '/reports/discontinued', permission: 'reports.customers' },
      { label: 'Not Joined Report', path: '/reports/not-joined', permission: 'reports.customers' },
      { label: 'Appointments & Visits', path: '/reports/appointments-visits', permission: 'reports.customers' },
      { label: 'Consultant Incentives', path: '/reports/incentives/consultants', permission: 'reports.incentives' },
      { label: 'BM Incentives', path: '/reports/incentives/branch-managers', permission: 'reports.incentives' },
      { label: 'Day Target Achievement', path: '/reports/incentives/day-targets', permission: 'reports.incentives' },
      { label: 'Meeting — Daily Status', path: '/reports/meetings/daily-status', permission: 'reports.sales' },
      { label: 'Customer Visit Details', path: '/reports/customers/visits', permission: 'reports.customers' },
      { label: 'Stock Transfer Report', path: '/reports/stock-transfer', permission: 'reports.inventory' },
    ],
  },
];

export function getFilteredNavigation(permissions = []) {
  const hasPermission = (perm) => !perm || permissions.includes(perm) || permissions.includes('*');

  const filtered = navigation
    .map((section) => ({
      ...section,
      children: section.children.filter((item) => hasPermission(item.permission)),
    }))
    .filter((section) => hasPermission(section.permission) && section.children.length > 0);

  return mergeRegistryIntoNavigation(filtered, permissions);
}

export function getBreadcrumbs(path) {
  const crumbs = [{ label: 'Home', path: '/dashboard' }];
  const clean = path.split('?')[0];

  for (const section of navigation) {
    const item = findNavItem(section.children, clean);
    if (item) {
      crumbs.push({ label: section.label, path: null });
      crumbs.push({ label: item.label, path: item.path });
      return crumbs;
    }
  }

  const merged = mergeRegistryIntoNavigation(navigation, ['*']);
  for (const section of merged) {
    const item = findNavItem(section.children, clean);
    if (item) {
      crumbs.push({ label: section.label, path: null });
      crumbs.push({ label: item.label, path: item.path });
      return crumbs;
    }
  }

  const screen = getScreenByPath(clean);
  if (screen) {
    const navId = moduleToNavId[screen.module];
    const section = navigation.find((s) => s.id === navId);
    if (section) crumbs.push({ label: section.label, path: null });
    crumbs.push({ label: screen.title, path: screen.path });
  }
  return crumbs;
}
