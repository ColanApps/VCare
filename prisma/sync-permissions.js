import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const newPerms = [
  { code: 'billing.cancel', module: 'Billing', action: 'cancel' },
  { code: 'billing.refunds', module: 'Billing', action: 'refunds' },
  { code: 'inventory.clinical', module: 'Inventory', action: 'clinical' },
  { code: 'callcenter.view', module: 'CallCenter', action: 'view' },
  { code: 'callcenter.followup', module: 'CallCenter', action: 'followup' },
  { code: 'master.discounts', module: 'Master', action: 'discounts' },
  { code: 'billing.advances', module: 'Billing', action: 'advances' },
  { code: 'billing.loans', module: 'Billing', action: 'loans' },
  { code: 'billing.pharmacy', module: 'Billing', action: 'pharmacy' },
  { code: 'inventory.transfer', module: 'Inventory', action: 'transfer' },
  { code: 'warehouse.view', module: 'Warehouse', action: 'view' },
  { code: 'warehouse.dispatch', module: 'Warehouse', action: 'dispatch' },
  { code: 'portal.view', module: 'Portal', action: 'view' },
  { code: 'portal.corporate', module: 'Portal', action: 'corporate' },
  { code: 'portal.accounts', module: 'Portal', action: 'accounts' },
  { code: 'reports.branches', module: 'Reports', action: 'branches' },
  { code: 'reports.inventory', module: 'Reports', action: 'inventory' },
  { code: 'billing.installments', module: 'Billing', action: 'installments' },
  { code: 'billing.pharmacy.b2b', module: 'Billing', action: 'pharmacy_b2b' },
  { code: 'master.reference', module: 'Master', action: 'reference' },
  { code: 'customer.treatment', module: 'Customer', action: 'treatment' },
  { code: 'billing.maintenance', module: 'Billing', action: 'maintenance' },
  { code: 'billing.service.b2b', module: 'Billing', action: 'service_b2b' },
  { code: 'inventory.outward', module: 'Inventory', action: 'outward' },
  { code: 'sales.view', module: 'Sales', action: 'view' },
  { code: 'sales.create', module: 'Sales', action: 'create' },
  { code: 'sales.invoice', module: 'Sales', action: 'invoice' },
  { code: 'portal.consultant', module: 'Portal', action: 'consultant' },
  { code: 'purchase.workorder', module: 'Purchase', action: 'workorder' },
  { code: 'reports.incentives', module: 'Reports', action: 'incentives' },
  { code: 'dashboard.biometric', module: 'Dashboard', action: 'biometric' },
  { code: 'dashboard.stock_inward', module: 'Dashboard', action: 'stock_inward' },
  { code: 'finance.view', module: 'Finance', action: 'view' },
  { code: 'finance.close.submit', module: 'Finance', action: 'close_submit' },
  { code: 'finance.close.approve', module: 'Finance', action: 'close_approve' },
  { code: 'finance.incentives', module: 'Finance', action: 'incentives' },
];

for (const perm of newPerms) {
  await prisma.permission.upsert({
    where: { code: perm.code },
    create: { ...perm, description: `${perm.module} - ${perm.action}` },
    update: {},
  });
}

const roles = await prisma.role.findMany();
for (const role of roles) {
  for (const perm of newPerms) {
    const p = await prisma.permission.findUnique({ where: { code: perm.code } });
    if (!p) continue;
    if (role.code === 'SUPER_ADMIN') {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        create: { roleId: role.id, permissionId: p.id },
        update: {},
      });
      continue;
    }
    const roleMap = {
      BRANCH_MANAGER: ['billing.cancel', 'billing.refunds', 'inventory.clinical', 'master.discounts', 'billing.advances', 'billing.installments', 'billing.pharmacy', 'billing.pharmacy.b2b', 'billing.service.b2b', 'billing.maintenance', 'inventory.transfer', 'inventory.outward', 'sales.view', 'sales.create', 'sales.invoice', 'reports.branches', 'reports.inventory', 'reports.consultants', 'reports.incentives', 'master.reference', 'callcenter.view', 'callcenter.followup', 'customer.treatment', 'dashboard.biometric', 'dashboard.stock_inward', 'purchase.workorder', 'finance.view', 'finance.close.submit', 'portal.view'],
      CONSULTANT: ['customer.treatment', 'portal.view', 'portal.consultant', 'reports.incentives', 'dashboard.biometric'],
      CALL_CENTER: ['callcenter.view', 'callcenter.followup'],
      ACCOUNTS: ['billing.cancel', 'billing.refunds', 'billing.advances', 'billing.loans', 'billing.installments', 'billing.pharmacy.b2b', 'billing.service.b2b', 'billing.maintenance', 'portal.view', 'portal.accounts', 'reports.branches', 'reports.consultants', 'sales.view', 'sales.invoice', 'reports.incentives', 'dashboard.biometric', 'finance.view', 'finance.close.approve', 'finance.incentives'],
      PHARMACIST: ['billing.pharmacy', 'billing.pharmacy.b2b'],
      WAREHOUSE: ['inventory.transfer', 'inventory.outward', 'warehouse.view', 'warehouse.dispatch', 'reports.inventory', 'sales.view', 'sales.create', 'purchase.workorder', 'dashboard.stock_inward'],
      CORPORATE: ['portal.view', 'portal.corporate', 'reports.branches'],
    };
    if (roleMap[role.code]?.includes(perm.code)) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        create: { roleId: role.id, permissionId: p.id },
        update: {},
      });
    }
  }
}

// Migrate legacy finance.close + BM billing.payments
const bmRole = await prisma.role.findUnique({ where: { code: 'BRANCH_MANAGER' } });
const paymentsPerm = await prisma.permission.findUnique({ where: { code: 'billing.payments' } });
if (bmRole && paymentsPerm) {
  await prisma.rolePermission.deleteMany({
    where: { roleId: bmRole.id, permissionId: paymentsPerm.id },
  });
}
const legacyClose = await prisma.permission.findUnique({ where: { code: 'finance.close' } });
if (legacyClose) {
  await prisma.rolePermission.deleteMany({ where: { permissionId: legacyClose.id } });
}

console.log('New permissions synced.');

// Sample Phase 3 master data (idempotent)
const sampleRules = [
  { code: 'DISC-HAIR-10', name: 'Hair Treatment 10%', type: 'SERVICE', category: 'HAIR', discountPercent: 10 },
  { code: 'DISC-PROD-5', name: 'Product 5% Off', type: 'PRODUCT', category: 'ALL', discountPercent: 5 },
];
for (const rule of sampleRules) {
  await prisma.discountRule.upsert({
    where: { code: rule.code },
    create: { ...rule, targetScope: 'ALL', isActive: true },
    update: {},
  });
}

await prisma.maxDiscountLimit.upsert({
  where: { type_category: { type: 'SERVICE', category: 'ALL' } },
  create: { type: 'SERVICE', category: 'ALL', maxPercent: 25 },
  update: {},
});

console.log('Phase 3 sample data synced.');

const city = await prisma.city.findFirst();
const zone = await prisma.zone.findFirst();
if (city && zone) {
  await prisma.branch.upsert({
    where: { code: 'WH-CENTRAL' },
    create: { code: 'WH-CENTRAL', name: 'Central Warehouse', type: 'WAREHOUSE', cityId: city.id, zoneId: zone.id, phone: '044-23456000', address: 'Central Warehouse, Chennai' },
    update: { type: 'WAREHOUSE' },
  });
  console.log('Warehouse branch synced.');
}

const corpBranch = await prisma.branch.findFirst({ where: { code: 'CHN-HAIR' } });
if (corpBranch) {
  await prisma.customer.upsert({
    where: { uhid: 'CORP20260001' },
    create: {
      uhid: 'CORP20260001',
      firstName: 'Apollo Pharmacy',
      lastName: '(Corporate)',
      companyName: 'Apollo Pharmacy Distributors',
      gstin: '33AABCA1234F1Z5',
      phone: '9876510000',
      email: 'billing@apollodist.com',
      customerType: 'CORPORATE',
      branchId: corpBranch.id,
      category: 'HAIR',
    },
    update: { customerType: 'CORPORATE', companyName: 'Apollo Pharmacy Distributors' },
  });
  console.log('Sample corporate B2B account synced.');
}

const demoHash = await bcrypt.hash('VCare@123', 10);
const pharmRole = await prisma.role.upsert({
  where: { code: 'PHARMACIST' },
  create: { code: 'PHARMACIST', name: 'Pharmacist', level: 35 },
  update: {},
});
const pharmBranch = await prisma.branch.findFirst({ where: { code: 'CHN-HAIR' } });
if (pharmBranch) {
  await prisma.user.upsert({
    where: { email: 'pharmacist@vcare.com' },
    create: {
      employeeId: 'E7001',
      email: 'pharmacist@vcare.com',
      passwordHash: demoHash,
      firstName: 'Kavitha',
      lastName: 'Menon',
      roleId: pharmRole.id,
      branchId: pharmBranch.id,
      phone: '9876543210',
    },
    update: { roleId: pharmRole.id },
  });
  const pharmPerms = ['billing.pharmacy', 'billing.pharmacy.b2b', 'inventory.view', 'inventory.stock', 'inventory.products', 'dashboard.view', 'billing.view'];
  for (const code of pharmPerms) {
    const p = await prisma.permission.findUnique({ where: { code } });
    if (!p) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: pharmRole.id, permissionId: p.id } },
      create: { roleId: pharmRole.id, permissionId: p.id },
      update: {},
    });
  }
  console.log('Pharmacist demo user synced.');
}

await prisma.$disconnect();
