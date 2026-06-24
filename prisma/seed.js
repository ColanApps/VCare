import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedDummyData } from './seedDummyData.js';
import { initScheduleWorkflow, completeScheduleStep } from '../src/services/schedulePendingService.js';

const prisma = new PrismaClient();

const permissions = [
  { code: 'dashboard.view', module: 'Dashboard', action: 'view' },
  { code: 'dashboard.inflow', module: 'Dashboard', action: 'inflow' },
  { code: 'dashboard.sales', module: 'Dashboard', action: 'sales' },
  { code: 'dashboard.branch', module: 'Dashboard', action: 'branch' },
  { code: 'dashboard.treatment', module: 'Dashboard', action: 'treatment' },
  { code: 'admin.view', module: 'Admin', action: 'view' },
  { code: 'admin.users', module: 'Admin', action: 'users' },
  { code: 'admin.organogram', module: 'Admin', action: 'organogram' },
  { code: 'admin.roles', module: 'Admin', action: 'roles' },
  { code: 'admin.ip', module: 'Admin', action: 'ip' },
  { code: 'admin.audit', module: 'Admin', action: 'audit' },
  { code: 'admin.notifications', module: 'Admin', action: 'notifications' },
  { code: 'master.view', module: 'Master', action: 'view' },
  { code: 'master.geography', module: 'Master', action: 'geography' },
  { code: 'master.branches', module: 'Master', action: 'branches' },
  { code: 'master.treatments', module: 'Master', action: 'treatments' },
  { code: 'master.diagnosis', module: 'Master', action: 'diagnosis' },
  { code: 'master.designations', module: 'Master', action: 'designations' },
  { code: 'master.targets', module: 'Master', action: 'targets' },
  { code: 'master.tickets', module: 'Master', action: 'tickets' },
  { code: 'customer.view', module: 'Customer', action: 'view' },
  { code: 'customer.create', module: 'Customer', action: 'create' },
  { code: 'customer.schedule', module: 'Customer', action: 'schedule' },
  { code: 'customer.consult', module: 'Customer', action: 'consult' },
  { code: 'customer.photos', module: 'Customer', action: 'photos' },
  { code: 'appointments.view', module: 'Appointments', action: 'view' },
  { code: 'appointments.create', module: 'Appointments', action: 'create' },
  { code: 'appointments.procedures', module: 'Appointments', action: 'procedures' },
  { code: 'appointments.followup', module: 'Appointments', action: 'followup' },
  { code: 'callcenter.view', module: 'CallCenter', action: 'view' },
  { code: 'callcenter.followup', module: 'CallCenter', action: 'followup' },
  { code: 'billing.view', module: 'Billing', action: 'view' },
  { code: 'billing.create', module: 'Billing', action: 'create' },
  { code: 'billing.payments', module: 'Billing', action: 'payments' },
  { code: 'billing.cancel', module: 'Billing', action: 'cancel' },
  { code: 'billing.refunds', module: 'Billing', action: 'refunds' },
  { code: 'inventory.view', module: 'Inventory', action: 'view' },
  { code: 'inventory.products', module: 'Inventory', action: 'products' },
  { code: 'inventory.stock', module: 'Inventory', action: 'stock' },
  { code: 'inventory.indent', module: 'Inventory', action: 'indent' },
  { code: 'inventory.authorize', module: 'Inventory', action: 'authorize' },
  { code: 'inventory.clinical', module: 'Inventory', action: 'clinical' },
  { code: 'purchase.view', module: 'Purchase', action: 'view' },
  { code: 'purchase.vendors', module: 'Purchase', action: 'vendors' },
  { code: 'purchase.po', module: 'Purchase', action: 'po' },
  { code: 'purchase.authorize', module: 'Purchase', action: 'authorize' },
  { code: 'purchase.grn', module: 'Purchase', action: 'grn' },
  { code: 'operations.view', module: 'Operations', action: 'view' },
  { code: 'operations.tickets', module: 'Operations', action: 'tickets' },
  { code: 'operations.iou', module: 'Operations', action: 'iou' },
  { code: 'operations.petty', module: 'Operations', action: 'petty' },
  { code: 'reports.view', module: 'Reports', action: 'view' },
  { code: 'reports.sales', module: 'Reports', action: 'sales' },
  { code: 'reports.customers', module: 'Reports', action: 'customers' },
  { code: 'reports.consultants', module: 'Reports', action: 'consultants' },
  { code: 'reports.gst', module: 'Reports', action: 'gst' },
  { code: 'reports.targets', module: 'Reports', action: 'targets' },
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

const rolePermissions = {
  SUPER_ADMIN: permissions.map((p) => p.code),
  CORPORATE: ['dashboard.view', 'dashboard.inflow', 'dashboard.sales', 'dashboard.branch', 'reports.view', 'reports.sales', 'reports.branches', 'operations.iou', 'operations.tickets', 'portal.view', 'portal.corporate'],
  BRANCH_MANAGER: ['dashboard.view', 'dashboard.sales', 'dashboard.branch', 'dashboard.treatment', 'dashboard.biometric', 'dashboard.stock_inward', 'customer.view', 'customer.create', 'customer.schedule', 'customer.consult', 'customer.photos', 'customer.treatment', 'appointments.view', 'appointments.create', 'appointments.procedures', 'appointments.followup', 'billing.view', 'billing.create', 'billing.cancel', 'billing.refunds', 'billing.advances', 'billing.installments', 'billing.pharmacy', 'billing.pharmacy.b2b', 'billing.service.b2b', 'billing.maintenance', 'inventory.view', 'inventory.stock', 'inventory.indent', 'inventory.authorize', 'inventory.clinical', 'inventory.transfer', 'inventory.outward', 'sales.view', 'sales.create', 'sales.invoice', 'operations.view', 'operations.tickets', 'operations.iou', 'operations.petty', 'reports.view', 'reports.sales', 'reports.customers', 'reports.targets', 'reports.branches', 'reports.inventory', 'reports.consultants', 'reports.incentives', 'master.tickets', 'master.discounts', 'master.reference', 'callcenter.view', 'callcenter.followup', 'finance.view', 'finance.close.submit', 'purchase.workorder', 'portal.view'],
  CONSULTANT: ['dashboard.view', 'dashboard.treatment', 'dashboard.biometric', 'customer.view', 'customer.consult', 'customer.photos', 'customer.schedule', 'customer.treatment', 'appointments.view', 'appointments.create', 'appointments.procedures', 'billing.view', 'billing.create', 'reports.view', 'reports.consultants', 'reports.incentives', 'portal.view', 'portal.consultant'],
  CALL_CENTER: ['dashboard.view', 'customer.view', 'customer.create', 'appointments.view', 'appointments.create', 'appointments.followup', 'callcenter.view', 'callcenter.followup'],
  WAREHOUSE: ['dashboard.view', 'dashboard.stock_inward', 'inventory.view', 'inventory.products', 'inventory.stock', 'inventory.transfer', 'inventory.outward', 'purchase.view', 'purchase.vendors', 'purchase.po', 'purchase.grn', 'purchase.workorder', 'reports.view', 'reports.sales', 'reports.inventory', 'warehouse.view', 'warehouse.dispatch'],
  PHARMACIST: ['dashboard.view', 'customer.view', 'billing.view', 'billing.pharmacy', 'billing.pharmacy.b2b', 'inventory.view', 'inventory.stock', 'inventory.products', 'inventory.indent', 'inventory.clinical'],
  THERAPIST: ['dashboard.view', 'customer.view', 'customer.schedule', 'customer.photos', 'customer.treatment', 'appointments.view', 'appointments.procedures', 'inventory.view', 'inventory.clinical'],
  ACCOUNTS: ['dashboard.view', 'dashboard.inflow', 'dashboard.biometric', 'billing.view', 'billing.payments', 'billing.refunds', 'billing.advances', 'billing.loans', 'billing.installments', 'billing.pharmacy.b2b', 'reports.view', 'reports.sales', 'reports.gst', 'reports.branches', 'reports.consultants', 'reports.incentives', 'operations.iou', 'portal.view', 'portal.accounts', 'finance.view', 'finance.close.approve', 'finance.incentives'],
};

async function main() {
  console.log('🌱 Seeding VCare ERP database...\n');

  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { ...p, description: `${p.module} - ${p.action}` },
      update: {},
    });
  }

  const roles = [
    { code: 'SUPER_ADMIN', name: 'Super Admin', level: 100 },
    { code: 'CORPORATE', name: 'Corporate', level: 90 },
    { code: 'BRANCH_MANAGER', name: 'Branch Manager', level: 70 },
    { code: 'CONSULTANT', name: 'Consultant / Doctor', level: 50 },
    { code: 'CALL_CENTER', name: 'Call Center Agent', level: 30 },
    { code: 'WAREHOUSE', name: 'Warehouse', level: 40 },
    { code: 'ACCOUNTS', name: 'Accounts', level: 60 },
    { code: 'PHARMACIST', name: 'Pharmacist', level: 35 },
    { code: 'THERAPIST', name: 'Therapist', level: 45 },
  ];

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: r,
      update: { name: r.name, level: r.level },
    });

    const perms = rolePermissions[r.code] || [];
    for (const code of perms) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          create: { roleId: role.id, permissionId: perm.id },
          update: {},
        });
      }
    }
  }

  const country = await prisma.country.upsert({
    where: { code: 'IN' },
    create: { code: 'IN', name: 'India' },
    update: {},
  });

  const state = await prisma.state.upsert({
    where: { code: 'TN' },
    create: { code: 'TN', name: 'Tamil Nadu', countryId: country.id },
    update: {},
  });

  const city = await prisma.city.upsert({
    where: { code: 'CHN' },
    create: { code: 'CHN', name: 'Chennai', stateId: state.id },
    update: {},
  });

  await prisma.area.upsert({
    where: { code: 'TNG' },
    create: { code: 'TNG', name: 'T Nagar', cityId: city.id },
    update: {},
  });

  const zones = [
    { code: 'SOUTH', name: 'South Zone' },
    { code: 'NORTH', name: 'North Zone' },
  ];
  for (const z of zones) {
    await prisma.zone.upsert({ where: { code: z.code }, create: z, update: {} });
  }

  const southZone = await prisma.zone.findUnique({ where: { code: 'SOUTH' } });

  const branches = [
    { code: 'WH-CENTRAL', name: 'Central Warehouse', type: 'WAREHOUSE', phone: '044-23456000' },
    { code: 'CHN-HAIR', name: 'Chennai Hair Center', type: 'HAIR', phone: '044-23456789' },
    { code: 'CHN-SKIN', name: 'Chennai Skin Clinic', type: 'SKIN', phone: '044-23456790' },
    { code: 'BLR-HAIR', name: 'Bangalore Hair Center', type: 'HAIR', phone: '080-23456789' },
    { code: 'HYD-SKIN', name: 'Hyderabad Skin Clinic', type: 'SKIN', phone: '040-23456789' },
  ];

  for (const b of branches) {
    await prisma.branch.upsert({
      where: { code: b.code },
      create: { ...b, cityId: city.id, zoneId: southZone.id, address: `${b.name}, Chennai` },
      update: {},
    });
  }

  const grade = await prisma.grade.upsert({
    where: { code: 'G5' },
    create: { code: 'G5', name: 'Grade 5 - Senior', level: 5 },
    update: {},
  });

  const designations = [
    { code: 'FOUNDER', name: 'Founder', gradeId: grade.id },
    { code: 'BM', name: 'Branch Manager', gradeId: grade.id },
    { code: 'CONS', name: 'Consultant', gradeId: grade.id },
    { code: 'SC', name: 'Sales Counselor', gradeId: grade.id },
    { code: 'CCA', name: 'Call Center Agent', gradeId: grade.id },
  ];
  for (const d of designations) {
    await prisma.designation.upsert({ where: { code: d.code }, create: d, update: {} });
  }

  const hash = await bcrypt.hash('VCare@123', 10);
  const branchHair = await prisma.branch.findUnique({ where: { code: 'CHN-HAIR' } });
  const branchSkin = await prisma.branch.findUnique({ where: { code: 'CHN-SKIN' } });
  const branchWarehouse = await prisma.branch.findUnique({ where: { code: 'WH-CENTRAL' } });
  const roleAdmin = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
  const roleBM = await prisma.role.findUnique({ where: { code: 'BRANCH_MANAGER' } });
  const roleCons = await prisma.role.findUnique({ where: { code: 'CONSULTANT' } });
  const roleCC = await prisma.role.findUnique({ where: { code: 'CALL_CENTER' } });
  const roleCorp = await prisma.role.findUnique({ where: { code: 'CORPORATE' } });
  const roleAccounts = await prisma.role.findUnique({ where: { code: 'ACCOUNTS' } });
  const roleWarehouse = await prisma.role.findUnique({ where: { code: 'WAREHOUSE' } });
  const rolePharmacist = await prisma.role.findUnique({ where: { code: 'PHARMACIST' } });
  const roleTherapist = await prisma.role.findUnique({ where: { code: 'THERAPIST' } });
  const desigFounder = await prisma.designation.findUnique({ where: { code: 'FOUNDER' } });
  const desigBM = await prisma.designation.findUnique({ where: { code: 'BM' } });
  const desigCons = await prisma.designation.findUnique({ where: { code: 'CONS' } });

  const users = [
    { employeeId: 'E1636', email: 'admin@vcare.com', firstName: 'Super', lastName: 'Admin', roleId: roleAdmin.id, designationId: desigFounder.id },
    { employeeId: 'E2001', email: 'bm.hair@vcare.com', firstName: 'Rajesh', lastName: 'Kumar', roleId: roleBM.id, designationId: desigBM.id, branchId: branchHair.id },
    { employeeId: 'E3001', email: 'dr.sharma@vcare.com', firstName: 'Priya', lastName: 'Sharma', roleId: roleCons.id, designationId: desigCons.id, branchId: branchHair.id },
    { employeeId: 'E3002', email: 'dr.patel@vcare.com', firstName: 'Anita', lastName: 'Patel', roleId: roleCons.id, designationId: desigCons.id, branchId: branchSkin.id },
    { employeeId: 'E4001', email: 'cc.agent@vcare.com', firstName: 'Meera', lastName: 'Nair', roleId: roleCC.id, branchId: branchHair.id },
    { employeeId: 'E5001', email: 'corporate@vcare.com', firstName: 'Vikram', lastName: 'Iyer', roleId: roleCorp.id },
    { employeeId: 'E5002', email: 'accounts@vcare.com', firstName: 'Sunita', lastName: 'Desai', roleId: roleAccounts.id },
    { employeeId: 'E6001', email: 'warehouse@vcare.com', firstName: 'Ravi', lastName: 'Subramanian', roleId: roleWarehouse.id, branchId: branchWarehouse?.id },
    { employeeId: 'E7001', email: 'pharmacist@vcare.com', firstName: 'Kavitha', lastName: 'Menon', roleId: rolePharmacist.id, branchId: branchHair.id },
    { employeeId: 'E7101', email: 'therapist.hair@vcare.com', firstName: 'Deepa', lastName: 'Rao', roleId: roleTherapist.id, branchId: branchHair.id },
    { employeeId: 'E7102', email: 'therapist.skin@vcare.com', firstName: 'Lakshmi', lastName: 'Venkatesh', roleId: roleTherapist.id, branchId: branchSkin.id },
  ];

  const createdUsers = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash: hash, phone: '9876543210' },
      update: {},
    });
    createdUsers[u.email] = user;
  }

  // Organogram
  const founder = await prisma.orgNode.upsert({
    where: { id: 'org-founder' },
    create: { id: 'org-founder', title: 'Founder & CEO', designation: 'Founder', department: 'Executive', userId: createdUsers['admin@vcare.com'].id, sortOrder: 1 },
    update: {},
  });

  const zonal = await prisma.orgNode.upsert({
    where: { id: 'org-zonal' },
    create: { id: 'org-zonal', title: 'Zonal Head - South', designation: 'Zonal Head', department: 'Operations', parentId: founder.id, sortOrder: 2 },
    update: {},
  });

  await prisma.orgNode.upsert({
    where: { id: 'org-bm-hair' },
    create: { id: 'org-bm-hair', title: 'Branch Manager - Chennai Hair', designation: 'Branch Manager', department: 'Clinical', parentId: zonal.id, userId: createdUsers['bm.hair@vcare.com'].id, sortOrder: 3 },
    update: {},
  });

  await prisma.orgNode.upsert({
    where: { id: 'org-cons-hair' },
    create: { id: 'org-cons-hair', title: 'Consultant - Dr. Priya Sharma', designation: 'Consultant', department: 'Clinical', parentId: 'org-bm-hair', userId: createdUsers['dr.sharma@vcare.com'].id, sortOrder: 4 },
    update: {},
  });

  // Treatments
  const treatments = [
    { code: 'HT-FUE', name: 'Hair Transplant FUE', category: 'HAIR', basePrice: 85000, duration: 480 },
    { code: 'PRP', name: 'PRP Therapy', category: 'HAIR', basePrice: 12000, duration: 90 },
    { code: 'GFC', name: 'GFC Treatment', category: 'HAIR', basePrice: 15000, duration: 60 },
    { code: 'LASER-H', name: 'Laser Hair Reduction', category: 'HAIR', basePrice: 8000, duration: 45 },
    { code: 'CHEM-PEEL', name: 'Chemical Peel', category: 'SKIN', basePrice: 6000, duration: 45 },
    { code: 'ACNE-TX', name: 'Acne Treatment', category: 'SKIN', basePrice: 5000, duration: 30 },
    { code: 'ANTI-AGE', name: 'Anti-Aging Therapy', category: 'SKIN', basePrice: 18000, duration: 60 },
  ];
  for (const t of treatments) {
    await prisma.treatment.upsert({ where: { code: t.code }, create: t, update: {} });
  }

  const diagnoses = [
    { code: 'AGA-M', name: 'Androgenetic Alopecia (Male)', category: 'HAIR' },
    { code: 'AGA-F', name: 'Androgenetic Alopecia (Female)', category: 'HAIR' },
    { code: 'TE', name: 'Telogen Effluvium', category: 'HAIR' },
    { code: 'ACNE-V', name: 'Acne Vulgaris', category: 'SKIN' },
    { code: 'MELASMA', name: 'Melasma', category: 'SKIN' },
  ];
  for (const d of diagnoses) {
    await prisma.diagnosis.upsert({ where: { code: d.code }, create: d, update: {} });
  }

  for (const o of [
    { code: 'IT', name: 'Information Technology' },
    { code: 'MED', name: 'Medical Professional' },
    { code: 'BIZ', name: 'Business Owner' },
    { code: 'STU', name: 'Student' },
  ]) {
    await prisma.occupation.upsert({ where: { code: o.code }, create: o, update: {} });
  }

  await prisma.therapist.upsert({
    where: { code: 'TH-DEEPA' },
    create: { code: 'TH-DEEPA', name: 'Deepa Rao', specialty: 'HAIR', branchId: branchHair.id },
    update: { isActive: true },
  });
  await prisma.therapist.upsert({
    where: { code: 'TH-LAKSHMI' },
    create: { code: 'TH-LAKSHMI', name: 'Lakshmi Venkatesh', specialty: 'SKIN', branchId: branchSkin.id },
    update: { isActive: true },
  });

  for (const k of [
    { code: 'REF', name: 'Referral' },
    { code: 'WEB', name: 'Website' },
    { code: 'SOC', name: 'Social Media' },
    { code: 'TV', name: 'TV Advertisement' },
  ]) {
    await prisma.knownBy.upsert({ where: { code: k.code }, create: k, update: {} });
  }

  // Vendors & Products
  const vendor = await prisma.vendor.upsert({
    where: { code: 'VND001' },
    create: { code: 'VND001', name: 'MedSupply India Pvt Ltd', type: 'BILLABLE', gstin: '33AABCM1234A1Z5', phone: '044-11112222' },
    update: {},
  });

  const products = [
    { sku: 'MIN-5', name: 'Minoxidil 5% Solution', type: 'BILLABLE', hsnCode: '3004', mrp: 850, costPrice: 450 },
    { sku: 'FIN-1', name: 'Finasteride 1mg Tablets', type: 'BILLABLE', hsnCode: '3004', mrp: 1200, costPrice: 600 },
    { sku: 'SHP-HT', name: 'Hair Transplant Shampoo', type: 'BILLABLE', hsnCode: '3305', mrp: 650, costPrice: 280 },
    { sku: 'VIT-H', name: 'Hair Vitamins Complex', type: 'BILLABLE', hsnCode: '2106', mrp: 1500, costPrice: 700 },
    { sku: 'PRP-KIT', name: 'PRP Collection Kit', type: 'CLINICAL', hsnCode: '9018', mrp: 2500, costPrice: 1200 },
    { sku: 'MESO-N', name: 'Mesotherapy Needles', type: 'CLINICAL', hsnCode: '9018', mrp: 800, costPrice: 350 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      create: { ...p, vendorId: vendor.id, taxRate: 18 },
      update: {},
    });
  }

  // Stock
  const allProducts = await prisma.product.findMany();
  const allBranches = await prisma.branch.findMany();
  for (const branch of allBranches) {
    for (const product of allProducts) {
      await prisma.stock.upsert({
        where: { productId_branchId_batchNo: { productId: product.id, branchId: branch.id, batchNo: 'BATCH001' } },
        create: { productId: product.id, branchId: branch.id, batchNo: 'BATCH001', quantity: Math.floor(Math.random() * 100) + 20 },
        update: {},
      });
    }
  }

  // Targets
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  for (const branch of allBranches) {
    await prisma.locationTarget.upsert({
      where: { branchId_month_year: { branchId: branch.id, month, year } },
      create: { branchId: branch.id, month, year, target: 1500000 + Math.random() * 500000 },
      update: {},
    });
  }

  // Customers
  const customerData = [
    { firstName: 'Arun', lastName: 'Venkatesh', phone: '9876500001', category: 'HAIR', branchId: branchHair.id },
    { firstName: 'Deepa', lastName: 'Raman', phone: '9876500002', category: 'SKIN', branchId: branchSkin.id },
    { firstName: 'Karthik', lastName: 'Sundaram', phone: '9876500003', category: 'HAIR', branchId: branchHair.id },
    { firstName: 'Lakshmi', lastName: 'Iyer', phone: '9876500004', category: 'SKIN', branchId: branchSkin.id },
    { firstName: 'Mohammed', lastName: 'Rizwan', phone: '9876500005', category: 'HAIR', branchId: branchHair.id },
    { firstName: 'Sneha', lastName: 'Reddy', phone: '9876500006', category: 'SKIN', branchId: branchSkin.id },
    { firstName: 'Vikram', lastName: 'Chopra', phone: '9876500007', category: 'HAIR', branchId: branchHair.id },
    { firstName: 'Anjali', lastName: 'Menon', phone: '9876500008', category: 'SKIN', branchId: branchSkin.id },
  ];

  const customers = [];
  for (let i = 0; i < customerData.length; i++) {
    const c = customerData[i];
    const customer = await prisma.customer.upsert({
      where: { uhid: `UHID2026${String(i + 1).padStart(5, '0')}` },
      create: {
        uhid: `UHID2026${String(i + 1).padStart(5, '0')}`,
        ...c,
        email: `${c.firstName.toLowerCase()}@email.com`,
        gender: i % 2 === 0 ? 'Male' : 'Female',
        leadSource: ['Referral', 'Website', 'Call Center', 'Walk-in'][i % 4],
        registeredAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      },
      update: {},
    });
    customers.push(customer);
  }

  // Appointments
  const consultantHair = createdUsers['dr.sharma@vcare.com'];
  const consultantSkin = createdUsers['dr.patel@vcare.com'];

  for (let i = 0; i < 15; i++) {
    const customer = customers[i % customers.length];
    const isToday = i < 5;
    const scheduledAt = isToday
      ? new Date(new Date().setHours(9 + i, (i % 2) * 30, 0, 0))
      : new Date(Date.now() + (i - 5) * 24 * 60 * 60 * 1000);

    await prisma.appointment.upsert({
      where: { appointmentNo: `APT2026${String(i + 1).padStart(5, '0')}` },
      create: {
        appointmentNo: `APT2026${String(i + 1).padStart(5, '0')}`,
        customerId: customer.id,
        consultantId: customer.category === 'HAIR' ? consultantHair.id : consultantSkin.id,
        branchId: customer.branchId,
        category: customer.category,
        scheduledAt,
        type: i % 3 === 0 ? 'TREATMENT' : 'CONSULTATION',
        status: ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'SCHEDULED'][i % 4],
        source: ['WALK_IN', 'CALL_CENTER', 'ONLINE', 'REFERRAL'][i % 4],
      },
      update: { scheduledAt, status: ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'SCHEDULED'][i % 4] },
    });
  }

  // Bills
  const htTreatment = await prisma.treatment.findUnique({ where: { code: 'HT-FUE' } });
  const prpTreatment = await prisma.treatment.findUnique({ where: { code: 'PRP' } });
  const gfcTreatment = await prisma.treatment.findUnique({ where: { code: 'GFC' } });

  for (let i = 0; i < 12; i++) {
    const customer = customers[i % customers.length];
    const treatment = customer.category === 'HAIR' ? htTreatment : prpTreatment;
    const subtotal = treatment.basePrice;
    const taxAmount = subtotal * 0.18;
    const total = subtotal + taxAmount;
    const paid = i % 3 === 0 ? total : i % 3 === 1 ? total * 0.5 : 0;

    await prisma.bill.upsert({
      where: { billNo: `BILL2026${String(i + 1).padStart(5, '0')}` },
      create: {
        billNo: `BILL2026${String(i + 1).padStart(5, '0')}`,
        customerId: customer.id,
        branchId: customer.branchId,
        createdById: customer.category === 'HAIR' ? consultantHair.id : consultantSkin.id,
        billDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        subtotal,
        taxAmount,
        totalAmount: total,
        paidAmount: paid,
        balanceAmount: total - paid,
        status: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
        paymentMode: ['CASH', 'CARD', 'UPI', 'LOAN'][i % 4],
        items: {
          create: [{
            itemType: 'SERVICE',
            itemCode: treatment.code,
            itemName: treatment.name,
            quantity: 1,
            unitPrice: subtotal,
            taxRate: 18,
            taxAmount,
            totalAmount: total,
          }],
        },
        ...(paid > 0 ? { payments: { create: { amount: paid, paymentMode: ['CASH', 'CARD', 'UPI'][i % 3] } } } : {}),
      },
      update: {
        paidAmount: paid,
        balanceAmount: total - paid,
        status: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
      },
    });
  }

  // Consultations — skip if already seeded; always ensure schedule workflow exists
  const consultCount = await prisma.consultation.count();
  if (consultCount < 5) {
    for (let i = consultCount; i < 5; i++) {
      const customer = customers[i];
      const consultation = await prisma.consultation.create({
        data: {
          customerId: customer.id,
          consultantId: customer.category === 'HAIR' ? consultantHair.id : consultantSkin.id,
          type: i === 0 ? 'INITIAL' : 'REGULAR',
          chiefComplaint: 'Hair thinning and scalp visibility',
          diagnosis: 'Androgenetic Alopecia - Stage III',
          notes: 'Patient advised PRP therapy and topical minoxidil',
          status: i < 2 ? 'PENDING' : 'COMPLETED',
        },
      });
      await initScheduleWorkflow(customer.id, consultation.id);
    }
  }

  const seededConsultations = await prisma.consultation.findMany({
    orderBy: { createdAt: 'asc' },
    take: 5,
  });
  for (const consultation of seededConsultations) {
    const stepCount = await prisma.schedulePendingStep.count({
      where: { customerId: consultation.customerId, consultationId: consultation.id },
    });
    if (stepCount === 0) {
      await initScheduleWorkflow(consultation.customerId, consultation.id);
    }
  }

  // Demo customer partial schedule workflow (Arun — first customer)
  const demoConsult = seededConsultations.find((c) => c.customerId === customers[0].id)
    || await prisma.consultation.findFirst({ where: { customerId: customers[0].id }, orderBy: { createdAt: 'asc' } });
  if (demoConsult) {
    await completeScheduleStep({
      customerId: customers[0].id,
      consultationId: demoConsult.id,
      step: 'CONSULTATION',
      userId: consultantHair.id,
    });
    await completeScheduleStep({
      customerId: customers[0].id,
      consultationId: demoConsult.id,
      step: 'BEFORE_PHOTO',
      userId: consultantHair.id,
    });
  }

  // Tickets
  for (const t of [
    { ticketNo: 'TKT202600001', title: 'Biometric device offline', description: 'Branch biometric not syncing', category: 'IT', priority: 'HIGH', createdById: createdUsers['bm.hair@vcare.com'].id, branchId: branchHair.id },
    { ticketNo: 'TKT202600002', title: 'AC not working in consultation room', description: 'Room 3 AC needs repair', category: 'FACILITY', priority: 'MEDIUM', createdById: createdUsers['bm.hair@vcare.com'].id, branchId: branchHair.id, status: 'IN_PROGRESS' },
  ]) {
    await prisma.ticket.upsert({
      where: { ticketNo: t.ticketNo },
      create: t,
      update: { status: t.status || 'OPEN' },
    });
  }

  for (const ip of [{ ipAddress: '127.0.0.1', description: 'Localhost' }, { ipAddress: '::1', description: 'IPv6 Localhost' }]) {
    await prisma.ipWhitelist.upsert({ where: { ipAddress: ip.ipAddress }, create: ip, update: {} });
  }

  // Phase 8 — registry master sample data
  for (const c of [
    { code: 'BLU', name: 'BlueDart', contact: 'Support', phone: '1800-123-456' },
    { code: 'DTDC', name: 'DTDC Express', contact: 'Ops', phone: '1800-999-888' },
  ]) {
    await prisma.courier.upsert({ where: { code: c.code }, create: c, update: {} });
  }
  for (const t of [
    { code: 'TRN01', name: 'VRL Logistics', phone: '9876543210', gstin: '29AABCV1234A1Z5' },
    { code: 'TRN02', name: 'Safe Express', phone: '9876543211', gstin: '27AABCS5678B1Z2' },
  ]) {
    await prisma.transporter.upsert({ where: { code: t.code }, create: t, update: {} });
  }
  for (const d of [
    { code: 'WH', name: 'Central Warehouse', address: 'Warehouse Gate A' },
    { code: 'BR', name: 'Branch Dock', address: 'Branch receiving bay' },
  ]) {
    await prisma.deliveryAt.upsert({ where: { code: d.code }, create: d, update: {} });
  }
  for (const o of [{ code: 'OT1', name: 'Procedure Room 1' }, { code: 'OT2', name: 'Procedure Room 2' }]) {
    await prisma.oTMaster.upsert({ where: { code: o.code }, create: o, update: {} });
  }
  const bannerCount = await prisma.banner.count();
  if (bannerCount === 0) {
    await prisma.banner.createMany({
      data: [
        { title: 'Summer Skin Care', category: 'SKIN' },
        { title: 'Hair Restoration Offer', category: 'HAIR' },
      ],
    });
  }
  for (const ct of [
    { code: 'PRP-CL', name: 'PRP Therapy', category: 'HAIR', basePrice: 15000 },
    { code: 'MNRF', name: 'MNRF Treatment', category: 'SKIN', basePrice: 12000 },
  ]) {
    await prisma.clinicalTreatment.upsert({ where: { code: ct.code }, create: ct, update: {} });
  }

  const { ensureChartOfAccounts } = await import('../src/services/ledgerService.js');
  await ensureChartOfAccounts();

  await seedDummyData(prisma, {
    branchHair,
    branchSkin,
    branchWarehouse,
    allBranches,
    allProducts,
    vendor,
    customers,
    createdUsers,
    consultantHair,
    consultantSkin,
    month,
    year,
    prpTreatment,
    htTreatment,
    gfcTreatment,
  });

  console.log('✅ Seed completed successfully!\n');
  console.log('Login credentials:');
  console.log('  Super Admin:    admin@vcare.com / VCare@123');
  console.log('  Branch Manager: bm.hair@vcare.com / VCare@123');
  console.log('  Consultant:     dr.sharma@vcare.com / VCare@123');
  console.log('  Call Center:    cc.agent@vcare.com / VCare@123');
  console.log('  Corporate:      corporate@vcare.com / VCare@123');
  console.log('  Accounts:       accounts@vcare.com / VCare@123');
  console.log('  Warehouse:      warehouse@vcare.com / VCare@123');
  console.log('  Pharmacist:     pharmacist@vcare.com / VCare@123');
  console.log('\nAPI Key: vcare-integration-key-2026');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
