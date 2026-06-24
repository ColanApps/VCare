#!/usr/bin/env node
/**
 * Generates docs/VCare-Local-First-MPA-FULL-SPEC.txt from codebase sources.
 * Run: node scripts/generate-local-first-spec.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registryScreens, _registryScreensRaw } from '../src/config/screenRegistry.js';
import { navigation } from '../src/config/navigation.js';
import { demoLogins } from '../src/config/demoLogins.js';
import { REGISTRY_SCREEN_META, REGISTRY_ACTIONS } from '../src/config/registryWorkflowMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'VCare-Local-First-MPA-FULL-SPEC.txt');

// ─── Role permissions (inline from seed — avoid DB) ─────────────────────────
const rolePermissions = {
  SUPER_ADMIN: '*',
  CORPORATE: ['dashboard.view', 'dashboard.inflow', 'dashboard.sales', 'dashboard.branch', 'reports.view', 'reports.sales', 'reports.branches', 'operations.iou', 'operations.tickets', 'portal.view', 'portal.corporate'],
  BRANCH_MANAGER: ['dashboard.view', 'dashboard.sales', 'dashboard.branch', 'dashboard.treatment', 'dashboard.biometric', 'dashboard.stock_inward', 'customer.view', 'customer.create', 'customer.schedule', 'customer.consult', 'customer.photos', 'customer.treatment', 'appointments.view', 'appointments.create', 'appointments.procedures', 'appointments.followup', 'billing.view', 'billing.create', 'billing.cancel', 'billing.refunds', 'billing.advances', 'billing.installments', 'billing.pharmacy', 'billing.pharmacy.b2b', 'billing.service.b2b', 'billing.maintenance', 'inventory.view', 'inventory.stock', 'inventory.indent', 'inventory.authorize', 'inventory.clinical', 'inventory.transfer', 'inventory.outward', 'sales.view', 'sales.create', 'sales.invoice', 'operations.view', 'operations.tickets', 'operations.iou', 'operations.petty', 'reports.view', 'reports.sales', 'reports.customers', 'reports.targets', 'reports.branches', 'reports.inventory', 'reports.consultants', 'reports.incentives', 'master.tickets', 'master.discounts', 'master.reference', 'callcenter.view', 'callcenter.followup', 'finance.view', 'finance.close.submit', 'purchase.workorder', 'portal.view'],
  CONSULTANT: ['dashboard.view', 'dashboard.treatment', 'dashboard.biometric', 'customer.view', 'customer.consult', 'customer.photos', 'customer.schedule', 'customer.treatment', 'appointments.view', 'appointments.create', 'appointments.procedures', 'billing.view', 'billing.create', 'reports.view', 'reports.consultants', 'reports.incentives', 'portal.view', 'portal.consultant'],
  CALL_CENTER: ['dashboard.view', 'customer.view', 'customer.create', 'appointments.view', 'appointments.create', 'appointments.followup', 'callcenter.view', 'callcenter.followup'],
  WAREHOUSE: ['dashboard.view', 'dashboard.stock_inward', 'inventory.view', 'inventory.products', 'inventory.stock', 'inventory.transfer', 'inventory.outward', 'purchase.view', 'purchase.vendors', 'purchase.po', 'purchase.grn', 'purchase.workorder', 'reports.view', 'reports.sales', 'reports.inventory', 'warehouse.view', 'warehouse.dispatch'],
  PHARMACIST: ['dashboard.view', 'customer.view', 'billing.view', 'billing.pharmacy', 'billing.pharmacy.b2b', 'inventory.view', 'inventory.stock', 'inventory.products', 'inventory.indent', 'inventory.clinical'],
  THERAPIST: ['dashboard.view', 'customer.view', 'customer.schedule', 'customer.photos', 'customer.treatment', 'appointments.view', 'appointments.procedures', 'inventory.view', 'inventory.clinical'],
  ACCOUNTS: ['dashboard.view', 'dashboard.inflow', 'dashboard.biometric', 'billing.view', 'billing.payments', 'billing.refunds', 'billing.advances', 'billing.loans', 'billing.installments', 'billing.pharmacy.b2b', 'reports.view', 'reports.sales', 'reports.gst', 'reports.branches', 'reports.consultants', 'reports.incentives', 'operations.iou', 'portal.view', 'portal.accounts', 'finance.view', 'finance.close.approve', 'finance.incentives'],
};

const ROLES = Object.keys(rolePermissions);

function hasPerm(role, perm) {
  const p = rolePermissions[role];
  if (p === '*') return true;
  return p.includes(perm);
}

function rolesForPermission(perm) {
  return ROLES.filter((r) => hasPerm(r, perm));
}

// ─── Parse Prisma models ────────────────────────────────────────────────────
function parsePrismaModels() {
  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const models = {};
  const blocks = schema.split(/^model /m).slice(1);
  for (const block of blocks) {
    const name = block.match(/^(\w+)/)?.[1];
    if (!name) continue;
    const fields = [];
    for (const line of block.split('\n')) {
      const m = line.match(/^\s+(\w+)\s+(\w+)/);
      if (!m || line.includes('@relation')) continue;
      const [, fname, ftype] = m;
      if (['id', 'createdAt', 'updatedAt'].includes(fname) && fields.length > 3) continue;
      fields.push({ name: fname, type: ftype, required: !line.includes('?') && !line.includes('@default') });
    }
    models[name] = fields;
  }
  return models;
}

const PRISMA_MODELS = parsePrismaModels();

// camelCase model name from registry model field
function prismaFieldsForModel(modelName) {
  if (!modelName || !PRISMA_MODELS[modelName]) return null;
  return PRISMA_MODELS[modelName];
}

// ─── Extract fields from njk/html ───────────────────────────────────────────
function parseFieldsFromContent(content) {
  const fieldMap = new Map();
  const buttons = new Set();

  for (const m of content.matchAll(/<(?:input|select|textarea)[^>]*name=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    const name = m[1];
    let type = 'text';
    if (/type=["']hidden["']/i.test(tag)) type = 'hidden';
    else if (/type=["']email["']/i.test(tag)) type = 'email';
    else if (/type=["']tel["']/i.test(tag)) type = 'tel';
    else if (/type=["']date["']/i.test(tag)) type = 'date';
    else if (/type=["']datetime-local["']/i.test(tag)) type = 'datetime-local';
    else if (/type=["']number["']/i.test(tag)) type = 'number';
    else if (/type=["']password["']/i.test(tag)) type = 'password';
    else if (/type=["']file["']/i.test(tag)) type = 'file';
    else if (/type=["']checkbox["']/i.test(tag)) type = 'checkbox';
    else if (tag.startsWith('<select')) type = 'select';
    else if (tag.startsWith('<textarea')) type = 'textarea';
    const required = /\brequired\b/.test(tag);
    fieldMap.set(name, { name, type, required });
  }
  for (const m of content.matchAll(/<button[^>]*>([^<]{2,50})<\/button>/g)) buttons.add(m[1].trim());

  return {
    fields: [...fieldMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    buttons: [...buttons].sort(),
  };
}

function extractFieldsFromTemplate(filePath, depth = 0) {
  if (!filePath || !fs.existsSync(filePath) || depth > 3) return { fields: [], buttons: [] };
  let content = fs.readFileSync(filePath, 'utf8');
  for (const inc of content.matchAll(/\{%\s*include\s+["']([^"']+)["']/g)) {
    const incPath = path.join(ROOT, 'src', 'views', inc[1]);
    if (fs.existsSync(incPath)) {
      content += '\n' + fs.readFileSync(incPath, 'utf8');
    }
  }
  return parseFieldsFromContent(content);
}

function pathToTemplate(routePath) {
  const clean = routePath.split('?')[0].replace(/^\//, '').replace(/:[^/]+/g, 'detail');
  const parts = clean.split('/').filter(Boolean);
  const candidates = new Set([
    path.join(ROOT, 'src', 'views', 'pages', `${clean}.njk`),
    path.join(ROOT, 'src', 'views', 'pages', clean, 'index.njk'),
  ]);
  if (parts.length >= 2) {
    candidates.add(path.join(ROOT, 'src', 'views', 'pages', parts[0], `${parts.slice(1).join('-')}.njk`));
    candidates.add(path.join(ROOT, 'src', 'views', 'pages', parts[0], `${parts[parts.length - 1]}.njk`));
    if (parts.length >= 3) {
      candidates.add(path.join(ROOT, 'src', 'views', 'pages', parts[0], parts[1], `${parts.slice(2).join('-')}.njk`));
    }
  }
  if (clean === 'auth/login') candidates.add(path.join(ROOT, 'src', 'views', 'pages', 'auth', 'login.njk'));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ─── Parse route files ──────────────────────────────────────────────────────
function parseRoutes() {
  const routesDir = path.join(ROOT, 'src', 'routes');
  const routes = [];
  for (const file of fs.readdirSync(routesDir)) {
    if (!file.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const mountPrefix = {
      'auth.js': '', 'dashboard.js': '', 'admin.js': '', 'master.js': '',
      'customer.js': '', 'appointments.js': '', 'callCenter.js': '/call-center',
      'billing.js': '', 'finance.js': '', 'sales.js': '', 'inventory.js': '',
      'purchase.js': '', 'purchaseWorkflows.js': '', 'warehouse.js': '',
      'operations.js': '', 'reports.js': '', 'portal.js': '', 'clinical.js': '',
      'treatment.js': '/customer/treatment', 'api.js': '/api', 'screens.js': '',
      'registryWorkflows.js': '', 'sales.js': '',
    }[file] ?? '';

    for (const m of content.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
      const method = m[1].toUpperCase();
      let p = m[2];
      if (!p.startsWith('/')) p = `/${p}`;
      const fullPath = p.startsWith('/api') || p.startsWith('/registry') || p.startsWith('/purchase') || p.startsWith('/customer/treatment')
        ? p
        : (mountPrefix + p).replace(/\/+/g, '/') || p;
      const permMatch = content.slice(m.index, m.index + 400).match(/requirePermission\(([^)]+)\)/);
      let perms = [];
      if (permMatch) {
        perms = permMatch[1].split(',').map((s) => s.replace(/['"`\s]/g, '')).filter(Boolean);
      }
      routes.push({ file, method, path: fullPath, permissions: perms, source: 'dedicated' });
    }
  }
  return routes;
}

// ─── Dedicated workflow screens ─────────────────────────────────────────────
const DEDICATED_SCREENS = [
  { id: 'login', path: '/auth/login', title: 'Login', module: 'auth', permission: null, type: 'form', template: 'auth/login.njk' },
  { id: 'dashboard', path: '/dashboard', title: 'Executive Overview', module: 'dashboard', permission: 'dashboard.view', type: 'dashboard' },
  { id: 'my-tasks', path: '/dashboard/my-tasks', title: 'My Tasks', module: 'dashboard', permission: 'dashboard.view', type: 'task-queue' },
  { id: 'role-home', path: '/dashboard/role-home', title: 'Role Home', module: 'dashboard', permission: 'dashboard.view', type: 'dashboard' },
  { id: 'customer-register', path: '/customer/register', title: 'Customer Registration', module: 'customer', permission: 'customer.create', type: 'form' },
  { id: 'customer-search', path: '/customer/search', title: 'Customer Search', module: 'customer', permission: 'customer.view', type: 'search' },
  { id: 'customer-profile', path: '/customer/:id', title: 'Customer Profile', module: 'customer', permission: 'customer.view', type: 'detail' },
  { id: 'schedule-pending', path: '/customer/schedule-pending', title: 'Schedule Pending', module: 'customer', permission: 'customer.schedule', type: 'wizard' },
  { id: 'clinical-workflow', path: '/clinical/workflow/:customerId', title: 'Clinical Workflow Wizard', module: 'clinical', permission: 'customer.view', type: 'wizard' },
  { id: 'billing-create', path: '/billing/create', title: 'Create Bill', module: 'billing', permission: 'billing.create', type: 'form' },
  { id: 'billing-detail', path: '/billing/:id', title: 'Bill Detail', module: 'billing', permission: 'billing.view', type: 'detail' },
  { id: 'billing-payments', path: '/billing/payments', title: 'Collect Payments', module: 'billing', permission: 'billing.payments', type: 'form' },
  { id: 'day-close', path: '/finance/day-close', title: 'Day Close', module: 'finance', permission: 'finance.close.submit|finance.close.approve', type: 'form-mc' },
  { id: 'aesthetics-po', path: '/purchase/aesthetics/orders', title: 'Aesthetics PO', module: 'purchase', permission: 'purchase.po', type: 'workflow' },
  { id: 'factory-indents', path: '/purchase/factory/indents', title: 'Factory Indents', module: 'purchase', permission: 'purchase.po', type: 'workflow' },
  { id: 'factory-inward', path: '/purchase/factory/inward', title: 'Factory Inward', module: 'purchase', permission: 'purchase.grn', type: 'workflow' },
  { id: 'asset-po', path: '/purchase/asset-po/search', title: 'Asset PO Search', module: 'purchase', permission: 'purchase.authorize', type: 'workflow' },
];

// Field specs for critical forms (hand-authored from templates)
const FORM_FIELD_SPECS = {
  '/auth/login': {
    fields: [
      { name: 'email', type: 'email', required: true, label: 'Email', validation: 'valid email format' },
      { name: 'password', type: 'password', required: true, label: 'Password', validation: 'min 1 char' },
    ],
    submit: { method: 'POST', action: '/auth/login', outcome: 'session cookie, redirect /dashboard/role-home' },
  },
  '/customer/register': {
    fields: [
      { name: 'firstName', type: 'text', required: true },
      { name: 'lastName', type: 'text', required: true },
      { name: 'gender', type: 'select', options: ['MALE', 'FEMALE', 'OTHER'] },
      { name: 'dateOfBirth', type: 'date', required: false },
      { name: 'phone', type: 'tel', required: true, unique: true },
      { name: 'alternatePhone', type: 'tel', required: false },
      { name: 'email', type: 'email', required: false },
      { name: 'address', type: 'text', required: false },
      { name: 'branchId', type: 'select', required: true },
      { name: 'category', type: 'select', options: ['HAIR', 'SKIN'], default: 'HAIR' },
      { name: 'occupationId', type: 'select', source: 'occupations' },
      { name: 'knownById', type: 'select', source: 'knownBy' },
      { name: 'leadSource', type: 'select', source: 'leadSources' },
    ],
    submit: { method: 'POST', action: '/customer/register', service: 'customerService.create', hooks: ['auditLog'], outcome: 'redirect schedule-pending or profile' },
  },
  '/billing/create': {
    fields: [
      { name: 'customerId', type: 'select', required: true },
      { name: 'procedureId', type: 'hidden', required: false },
      { name: 'paymentMode', type: 'select', options: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] },
      { name: 'items', type: 'json-repeater', required: true, schema: 'itemType,itemCode,itemName,quantity,unitPrice,discount,taxRate' },
      { name: 'discount', type: 'number', label: 'Additional discount' },
      { name: 'paidAmount', type: 'number', guard: 'billing.payments', default: 0 },
      { name: 'referenceNo', type: 'text' },
      { name: 'useInstallmentPlan', type: 'checkbox' },
      { name: 'installmentRate', type: 'number', visibleIf: 'useInstallmentPlan' },
      { name: 'installmentTenure', type: 'number', visibleIf: 'useInstallmentPlan' },
    ],
    submit: { method: 'POST', action: '/billing/create', service: 'billingService.createBill', hooks: ['notifyBillWorkflow'], guard: 'assertCreatePaymentAllowed' },
  },
  '/finance/day-close': {
    fields: [
      { name: 'branchId', type: 'select', required: true, source: 'branches' },
      { name: 'date', type: 'date', required: true, note: 'GET filter for preview' },
      { name: 'physicalCash', type: 'number', required: true, label: 'Physical cash counted' },
      { name: 'closeDate', type: 'hidden', required: true },
      { name: 'notes', type: 'textarea', required: false },
    ],
    readOnlyKpis: ['billsTotal', 'collectionsTotal', 'systemCash', 'gstOutput', 'cashCollections', 'cardCollections', 'upiCollections', 'bankCollections', 'depositsTotal', 'pettyTotal', 'refundsTotal', 'paymentCount', 'ledgerSummary'],
    roleSplit: {
      'finance.close.submit': ['POST /finance/day-close — Submit for Approval'],
      'finance.close.approve': ['POST /finance/day-close/:id/approve', 'POST /finance/day-close/:id/lock'],
    },
    makerChecker: { submitterField: 'closedById', approverField: 'approvedById', rule: 'submitter !== approver' },
    persistence: 'DayClose model — status DRAFT→SUBMITTED→APPROVED→LOCKED',
  },
  '/call-center/dialer': {
    fields: [
      { name: 'phone', type: 'tel', required: true, label: 'Lookup phone' },
      { name: 'customerId', type: 'hidden', setAfter: 'lookup' },
      { name: 'consultantId', type: 'select', source: 'consultants-by-branch' },
      { name: 'treatmentId', type: 'select', source: 'treatments' },
      { name: 'scheduledAt', type: 'datetime-local', required: true },
      { name: 'notes', type: 'textarea' },
    ],
    actions: [
      { label: 'Lookup', method: 'POST', path: '/call-center/dialer/lookup' },
      { label: 'Book', method: 'POST', path: '/call-center/dialer/book', hooks: ['onAppointmentBooked'] },
    ],
  },
};

// ─── Build screen inventory ─────────────────────────────────────────────────
function flattenNav(nav, acc = []) {
  for (const section of nav) {
    for (const child of section.children || []) {
      if (child.isGroup) {
        for (const item of child.children || []) acc.push({ ...item, section: section.label, module: section.id });
      } else {
        acc.push({ ...child, section: section.label, module: section.id });
      }
    }
  }
  return acc;
}

function screenTypeSpec(screen) {
  const t = screen.type || 'page';
  if (t === 'master') {
    return {
      layout: 'master-crud',
      listColumns: screen.fields || [],
      formFields: (screen.fields || []).map((f) => ({ name: f, type: 'text', required: f === 'code' || f === 'name' })),
      actions: ['create', 'edit', 'delete', 'export'],
    };
  }
  if (t === 'report') {
    const meta = REGISTRY_SCREEN_META[screen.dataKey] || {};
    return {
      layout: 'report-table',
      dataKey: screen.dataKey,
      filters: ['branchId', 'dateFrom', 'dateTo', 'search'],
      export: true,
      rowActions: meta.actions || [],
      drillDown: meta.entity ? { entity: meta.entity, col: meta.col } : null,
    };
  }
  if (t === 'form') return { layout: 'form', dataKey: screen.dataKey };
  if (t === 'dashboard') return { layout: 'dashboard-widgets', dataKey: screen.dataKey };
  return { layout: 'page' };
}

// ─── Generate document ────────────────────────────────────────────────────────
function generate() {
  const routes = parseRoutes();
  const navItems = flattenNav(navigation);
  const registrySet = new Set(registryScreens.map((s) => s.path.split('?')[0]));

  const lines = [];
  const w = (s = '') => lines.push(s);

  w('================================================================================');
  w('  VCare ERP — LOCAL-FIRST MPA — COMPLETE IMPLEMENTATION PROMPT');
  w('  Screen-by-Screen | Role-by-Role | Workflow-by-Workflow | Field-Level');
  w('================================================================================');
  w(`  Generated : ${new Date().toISOString()}`);
  w(`  Source    : VCare Express codebase (auto-extracted + curated field specs)`);
  w(`  Registry  : ${registryScreens.length} screens | Nav: ${navItems.length} items | Routes: ${routes.length}`);
  w('================================================================================');
  w('');
  w('HOW TO USE THIS DOCUMENT');
  w('------------------------');
  w('This is the authoritative build prompt for a local-first MPA (IndexedDB + Vite).');
  w('Implement EVERY screen below with identical behavior to the Express server app.');
  w('Each screen block defines: route, roles, permissions, UI fields, actions, workflows,');
  w('side-effects, and acceptance criteria. Do not skip any screen marked REQUIRED.');
  w('');
  w('GLOBAL BUILD RULES (apply to every screen)');
  w('  G1. Repository adapter pattern — no direct IndexedDB in views');
  w('  G2. RBAC: route guard + field guard + service guard (triple layer)');
  w('  G3. billing.payments → ACCOUNTS only for paidAmount / collect payment');
  w('  G4. finance.close.submit (BM) vs finance.close.approve (Accounts), MC enforced');
  w('  G5. Workflow hooks fire in same transaction as parent mutation');
  w('  G6. Money stored as integer paise; display as INR ₹ with en-IN locale');
  w('  G7. Audit log on every CREATE/UPDATE/DELETE/approve/submit');
  w('  G8. Deep-linkable URLs; browser back button must not break state');
  w('  G9. Task queue must update after every workflow state change');
  w('  G10. PDF routes return application/pdf for bill, receipt, advance, challan, consent');
  w('');

  // ─── PART 1: ROLES ───────────────────────────────────────────────────────
  w('################################################################################');
  w('# PART 1 — USER ROLES (COMPLETE)');
  w('################################################################################');
  w('');
  for (const role of ROLES) {
    w(`─── ROLE: ${role} ───`);
    w(`  Demo login: ${demoLogins.find((d) => d.label.toUpperCase().includes(role.split('_')[0]))?.email || 'admin@vcare.com'} / VCare@123`);
    w(`  Home route: /dashboard/role-home → task queue sections for ${role}`);
    w('  Permissions:');
    const perms = rolePermissions[role] === '*' ? ['ALL (*)' ] : rolePermissions[role];
    for (const p of perms) w(`    - ${p}`);
    w('  Cannot do (explicit denials):');
    if (role !== 'SUPER_ADMIN' && role !== 'ACCOUNTS') w('    - Record bill payment (billing.payments)');
    if (role === 'CALL_CENTER') w('    - Create bills, clinical procedures, authorize indents');
    if (role === 'THERAPIST') w('    - Create bills, create customers');
    if (role === 'ACCOUNTS') w('    - Submit day close (finance.close.submit) — approve only');
    if (role === 'BRANCH_MANAGER') w('    - Approve day close, collect payments');
    w('  Task queue sections: see Part 4 workflow W-TASK-*');
    w('');
  }

  // ─── PART 2: ROLE × PERMISSION MATRIX ────────────────────────────────────
  w('################################################################################');
  w('# PART 2 — ROLE × PERMISSION MATRIX');
  w('################################################################################');
  w('');
  const allPerms = [...new Set(Object.values(rolePermissions).flat().filter((p) => p !== '*'))].sort();
  w('Permission'.padEnd(35) + ROLES.map((r) => r.slice(0, 8).padEnd(10)).join(''));
  w('-'.repeat(35 + ROLES.length * 10));
  for (const perm of allPerms) {
    w(perm.padEnd(35) + ROLES.map((r) => (hasPerm(r, perm) ? 'YES' : '—').padEnd(10)).join(''));
  }
  w('');

  // ─── PART 3: REGISTRY ACTIONS ────────────────────────────────────────────
  w('################################################################################');
  w('# PART 3 — REGISTRY & ROW ACTIONS (ALL)');
  w('################################################################################');
  w('');
  for (const [key, action] of Object.entries(REGISTRY_ACTIONS)) {
    w(`ACTION: ${key}`);
    w(`  Label   : ${action.label}`);
    w(`  Method  : ${action.method}`);
    w(`  URL     : ${action.url}`);
    if (action.confirm) w(`  Confirm : "${action.confirm}"`);
    if (action.style) w(`  Style   : ${action.style}`);
    if (action.needsAction) w(`  Note    : POST body must include action=approve|reject`);
    w(`  Local impl: invoke matching service method inside adapter.transaction()`);
    w('');
  }

  // ─── PART 4: MULTI-ROLE CHAINS ───────────────────────────────────────────
  w('################################################################################');
  w('# PART 4 — MULTI-ROLE WORKFLOW CHAINS (E2E REQUIRED)');
  w('################################################################################');
  const chains = [
    ['CHAIN-01', 'Lead→Appt→Consult→Procedure→Bill→Payment', 'CALL_CENTER→CONSULTANT→THERAPIST→CONSULTANT→ACCOUNTS'],
    ['CHAIN-02', 'Unbilled procedure→BM bill→Accounts pay', 'CONSULTANT→BM→ACCOUNTS'],
    ['CHAIN-03', 'Treatment slip 6 sessions', 'CONSULTANT→CALL_CENTER→THERAPIST (repeat)'],
    ['CHAIN-04', 'Pharmacy procedure bill', 'CONSULTANT→PHARMACIST→ACCOUNTS'],
    ['CHAIN-05', 'Payment guard rejection', 'CONSULTANT/PHARMACIST/BM rejected; ACCOUNTS OK'],
    ['CHAIN-06', 'Day close maker-checker', 'BM submit→ACCOUNTS approve≠submitter→lock'],
    ['CHAIN-07', 'Indent authorize→fulfill', 'PHARMACIST→BM→WAREHOUSE'],
    ['CHAIN-08', 'Work order auth→complete', 'WAREHOUSE→BM→WAREHOUSE'],
    ['CHAIN-09', 'IOU request→corporate approve', 'BM→CORPORATE'],
    ['CHAIN-10', 'Permanent refund approve', 'BM→ACCOUNTS→issueRefund'],
    ['CHAIN-11', 'Petty cash approve', 'STAFF→BM'],
    ['CHAIN-12', 'Sales order→invoice→payment', 'BM→BM→ACCOUNTS'],
    ['CHAIN-13', 'Advance apply + credit note', 'ACCOUNTS'],
    ['CHAIN-14', 'Stock transfer inter-branch', 'WAREHOUSE→BM→WAREHOUSE'],
    ['CHAIN-15', 'Incentive upload→calculate→pay', 'ACCOUNTS'],
    ['CHAIN-16', 'Schedule pending wizard', 'CALL_CENTER→CONSULTANT'],
    ['CHAIN-17', 'Aesthetics PO→auth→GRN→QC', 'WAREHOUSE→CORPORATE/BM→WAREHOUSE'],
    ['CHAIN-18', 'Factory indent→approve→inward→QC', 'WAREHOUSE→BM→WAREHOUSE'],
    ['CHAIN-19', 'Clinical consumption→reorder indent', 'THERAPIST→system→PHARMACIST'],
    ['CHAIN-20', 'Online order API→fulfillment', 'API→CALL_CENTER→clinical chain'],
  ];
  for (const [id, name, roles] of chains) {
    w(`${id}: ${name}`);
    w(`  Role sequence: ${roles}`);
    w(`  E2E test file: tests/e2e/${id.toLowerCase()}.spec.ts`);
    w(`  Pass criteria: zero balance errors; correct follow-up states; audit log entries`);
    w('');
  }

  // ─── PART 5: EVERY SCREEN ────────────────────────────────────────────────
  w('################################################################################');
  w('# PART 5 — SCREEN-BY-SCREEN SPECIFICATION');
  w('################################################################################');
  w('');

  let screenNum = 0;

  function emitScreen(spec) {
    screenNum++;
    const perm = spec.permission || spec.permissions?.[0] || 'none';
    const permList = typeof perm === 'string' && perm.includes('|') ? perm.split('|') : [perm];
    const accessRoles = permList[0] === 'none'
      ? ROLES
      : [...new Set(permList.flatMap((p) => rolesForPermission(p)))];
    w(`┌─────────────────────────────────────────────────────────────────────────────`);
    w(`│ SCREEN ${String(screenNum).padStart(3, '0')}: ${spec.title}`);
    w(`├─────────────────────────────────────────────────────────────────────────────`);
    w(`│ ID         : ${spec.id || spec.path}`);
    w(`│ Route      : ${spec.method || 'GET'} ${spec.path}`);
    w(`│ Module     : ${spec.module || '—'}`);
    w(`│ Type       : ${spec.type || 'page'}`);
    w(`│ Permission : ${perm}`);
    w(`│ Roles      : ${accessRoles.join(', ')}`);
    if (spec.dataKey) w(`│ Data key   : ${spec.dataKey}`);
    if (spec.model) w(`│ Model      : ${spec.model}`);
    w(`│ REQUIRED   : YES`);
    w(`├─────────────────────────────────────────────────────────────────────────────`);

    const typeSpec = screenTypeSpec(spec);
    w(`│ LAYOUT     : ${typeSpec.layout}`);
    if (typeSpec.listColumns?.length) w(`│ Columns    : ${typeSpec.listColumns.join(', ')}`);
    if (typeSpec.filters) w(`│ Filters    : ${typeSpec.filters.join(', ')}`);
    if (typeSpec.rowActions?.length) w(`│ Row actions: ${typeSpec.rowActions.join(', ')}`);
    if (typeSpec.drillDown) w(`│ Drill-down : ${typeSpec.drillDown.entity} via col ${typeSpec.drillDown.col}`);

    const cleanPath = spec.path.split('?')[0].replace(/:[^/]+/g, '1');
    const fieldSpec = FORM_FIELD_SPECS[cleanPath] || FORM_FIELD_SPECS[spec.path?.split('?')[0]];
    const tpl = spec.template ? path.join(ROOT, 'src', 'views', 'pages', spec.template) : pathToTemplate(cleanPath);
    const extracted = tpl ? extractFieldsFromTemplate(tpl) : { fields: [], filters: [], buttons: [] };

    const prismaFields = spec.model ? prismaFieldsForModel(spec.model) : null;

    if (fieldSpec?.fields) {
      w(`│ FIELDS (curated — authoritative):`);
      for (const f of fieldSpec.fields) {
        const guards = f.guard ? ` [guard: ${f.guard}]` : '';
        const hide = f.hideUnless ? ` [visible only: ${f.hideUnless}]` : '';
        const vis = f.visibleIf ? ` [visible if: ${f.visibleIf}]` : '';
        w(`│   - ${f.name} (${f.type})${f.required ? ' REQUIRED' : ''}${guards}${hide}${vis}`);
        if (f.options) w(`│       options: ${f.options.join('|')}`);
        if (f.schema) w(`│       json schema: ${f.schema}`);
        if (f.validation) w(`│       validation: ${f.validation}`);
        if (f.note) w(`│       note: ${f.note}`);
      }
      if (fieldSpec.readOnlyKpis) w(`│ READ-ONLY KPIs: ${fieldSpec.readOnlyKpis.join(', ')}`);
      if (fieldSpec.persistence) w(`│ PERSISTENCE: ${fieldSpec.persistence}`);
      if (fieldSpec.makerChecker) w(`│ MAKER-CHECKER: ${JSON.stringify(fieldSpec.makerChecker)}`);
      if (fieldSpec.roleSplit) {
        w(`│ ROLE SPLIT:`);
        for (const [perm, acts] of Object.entries(fieldSpec.roleSplit)) {
          w(`│   ${perm}: ${acts.join('; ')}`);
        }
      }
    } else if (prismaFields?.length) {
      w(`│ FIELDS (Prisma model ${spec.model}):`);
      for (const f of prismaFields) {
        w(`│   - ${f.name} (${f.type})${f.required ? ' REQUIRED' : ' optional'}`);
      }
    } else if (spec.fields) {
      w(`│ FIELDS (registry master columns):`);
      for (const f of spec.fields) {
        w(`│   - ${f} (text) — master CRUD field`);
      }
    } else if (extracted.fields.length) {
      w(`│ FIELDS (from template ${tpl ? path.relative(ROOT, tpl) : '—'}):`);
      for (const f of extracted.fields) {
        w(`│   - ${f.name} (${f.type})${f.required ? ' REQUIRED' : ''}`);
      }
    } else if (typeSpec.formFields) {
      w(`│ FIELDS:`);
      for (const f of typeSpec.formFields) w(`│   - ${f.name} (${f.type})`);
    } else {
      w(`│ FIELDS: standard report filters — branchId, dateFrom, dateTo, q (search)`);
      w(`│ TABLE: server-driven columns from screenDataService dataKey=${spec.dataKey || 'n/a'}`);
    }

    if (extracted.buttons.length) w(`│ BUTTONS: ${extracted.buttons.join(' | ')}`);

    if (fieldSpec?.actions) {
      w(`│ ACTIONS:`);
      for (const a of fieldSpec.actions) w(`│   - ${a.label}: ${a.method} ${a.path} hooks=${(a.hooks || []).join(',')}`);
    }
    if (fieldSpec?.submit) {
      w(`│ SUBMIT: ${fieldSpec.submit.method} → ${fieldSpec.submit.action || fieldSpec.submit.service}`);
      if (fieldSpec.submit.hooks) w(`│   hooks: ${fieldSpec.submit.hooks.join(', ')}`);
    }
    if (spec.actions) w(`│ Screen actions key: ${spec.actions}`);

    // Route handlers for this path
    const matchingRoutes = routes.filter((r) => r.path === spec.path || r.path === cleanPath);
    if (matchingRoutes.length) {
      w(`│ HTTP handlers:`);
      for (const r of matchingRoutes) w(`│   ${r.method} ${r.path} (${r.file}) perms=${r.permissions.join(',')}`);
    }

    w(`│ ACCEPTANCE:`);
    w(`│   1. Unauthorized role → 403 or hidden nav`);
    w(`│   2. Authorized role → page loads with correct data scope (branch filter)`);
    w(`│   3. Submit/action → persistence + workflow hooks + task queue refresh`);
    w(`└─────────────────────────────────────────────────────────────────────────────`);
    w('');
  }

  // Dedicated screens first
  w('─── SECTION A: CORE WORKFLOW SCREENS (dedicated routes) ───');
  w('');
  for (const s of DEDICATED_SCREENS) emitScreen(s);

  // Navigation items not in registry
  w('─── SECTION B: NAVIGATION SCREENS (dedicated route files) ───');
  w('');
  const emitted = new Set(DEDICATED_SCREENS.map((s) => s.path.split('?')[0]));
  for (const item of navItems) {
    const p = item.path.split('?')[0];
    if (emitted.has(p)) continue;
    emitted.add(p);
    const reg = registryScreens.find((s) => s.path.split('?')[0] === p);
    emitScreen({
      id: reg?.id || `nav-${p.replace(/\//g, '-')}`,
      path: item.path,
      title: item.label,
      module: item.module,
      permission: item.permission,
      type: reg?.type || 'page',
      ...(reg || {}),
    });
  }

  // All registry screens
  w('─── SECTION C: REGISTRY SCREENS (screenRegistry.js) ───');
  w('');
  for (const s of registryScreens) {
    const p = s.path.split('?')[0];
    if (emitted.has(p)) continue;
    emitted.add(p);
    emitScreen(s);
  }

  // Remaining routes not yet emitted
  w('─── SECTION D: ADDITIONAL HTTP ROUTES ───');
  w('');
  for (const r of routes) {
    const p = r.path.replace(/:[^/]+/g, '*');
    if ([...emitted].some((e) => r.path.startsWith(e.replace(/:\w+/g, '')) || e === r.path)) continue;
    emitScreen({
      id: `route-${r.file}-${r.method}-${p.replace(/\//g, '-')}`,
      path: r.path,
      method: r.method,
      title: `${r.method} ${r.path}`,
      module: r.file.replace('.js', ''),
      permission: r.permissions[0] || 'authenticated',
      permissions: r.permissions,
      type: 'api',
    });
  }

  // ─── PART 6: WORKFLOW ENGINE ─────────────────────────────────────────────
  w('################################################################################');
  w('# PART 6 — WORKFLOW ORCHESTRATION (EVERY HOOK)');
  w('################################################################################');
  w('');
  const hooks = [
    ['onAppointmentBooked', 'appointment→CONFIRMED; complete NOT_JOINED/REGULAR/TREATMENT FUs; audit'],
    ['onConsultationCompleted', 'consultation→COMPLETED'],
    ['onProcedureCompleted', 'procedure→COMPLETED; appointment→COMPLETED; visit; slip; next session FU'],
    ['onBillCreated', 'link procedure.billId; complete PROCEDURE_COMPLETED FU; PENDING_ADVANCE FU if balance'],
    ['notifyBillWorkflow', 'onBillCreated + onPaymentRecorded for embedded payments'],
    ['onPaymentRecorded', 'if balance=0 complete PENDING_ADVANCE; scheduleRebookAfterPayment'],
    ['onPharmacyBillCreated', 'link procedure.pharmacyBillId'],
    ['checkReorderAfterConsumption', 'if stock<reorder create indent draft'],
    ['onIndentApproved', 'supply chain fulfillment prep'],
    ['onWorkOrderCompleted', 'stock inward from WO'],
  ];
  for (const [name, effect] of hooks) {
    w(`HOOK: ${name}`);
    w(`  Effect: ${effect}`);
    w(`  Transaction: REQUIRED same tx as trigger`);
    w('');
  }

  w('################################################################################');
  w('# PART 7 — INDEXEDDB SCHEMA (ALL PRISMA MODELS)');
  w('################################################################################');
  w('');
  for (const [model, fields] of Object.entries(PRISMA_MODELS).sort(([a], [b]) => a.localeCompare(b))) {
    w(`MODEL ${model}:`);
    for (const f of fields.slice(0, 25)) {
      w(`  ${f.name.padEnd(22)} ${f.type.padEnd(12)} ${f.required ? 'required' : 'optional'}`);
    }
    if (fields.length > 25) w(`  ... +${fields.length - 25} more fields`);
    w('');
  }

  // ─── PART 8: API STUBS ───────────────────────────────────────────────────
  w('################################################################################');
  w('# PART 8 — EXTERNAL API STUBS (local-first)');
  w('################################################################################');
  w('POST /api/call-center/appointments — API key auth; creates appointment + onAppointmentBooked');
  w('GET  /api/call-center/slots — available slots by branch/consultant/date');
  w('GET  /api/call-center/customer/:phone — customer lookup');
  w('POST /api/online-orders — create online order; admin queue at /admin/online-orders');
  w('GET  /api/health — { status: ok, mode: local }');
  w('');

  w('================================================================================');
  w(`END OF SPEC — ${screenNum} screens documented`);
  w('================================================================================');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUT} (${lines.length} lines, ${screenNum} screens)`);
}

generate();
