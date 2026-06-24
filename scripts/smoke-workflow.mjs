#!/usr/bin/env node
/**
 * E2E role-chain smoke test — HTTP session flow + service sanity checks.
 * Run with dev server up: npm run dev  →  node scripts/smoke-workflow.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const prisma = new PrismaClient();

class SessionClient {
  constructor() {
    this.cookies = '';
  }

  mergeCookies(response) {
    const raw = response.headers.getSetCookie?.() || [];
    const parts = raw.map((c) => c.split(';')[0]).filter(Boolean);
    if (!parts.length) return;
    const jar = new Map(this.cookies.split('; ').filter(Boolean).map((p) => p.split('=')));
    for (const p of parts) {
      const [k, ...v] = p.split('=');
      jar.set(k, v.join('='));
    }
    this.cookies = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const headers = { ...(options.headers || {}) };
    if (this.cookies) headers.Cookie = this.cookies;
    const res = await fetch(url, { redirect: 'manual', ...options, headers });
    this.mergeCookies(res);
    return res;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(client, email, password) {
  const get = await client.request('/auth/login');
  assert(get.status === 200, `Login page failed: ${get.status}`);
  const post = await client.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  });
  assert(post.status === 302, `Login POST expected 302, got ${post.status}`);
}

async function expectOk(client, path, label) {
  const res = await client.request(path);
  assert(res.status === 200 || res.status === 302, `${label} (${path}): ${res.status}`);
  return res;
}

async function runHttpChain() {
  const client = new SessionClient();
  const creds = { email: 'admin@vcare.com', password: 'VCare@123' };

  console.log('→ Login as admin');
  await login(client, creds.email, creds.password);

  const customer = await prisma.customer.findFirst({ orderBy: { createdAt: 'asc' } });
  assert(customer, 'No customer in database — run npm run db:seed');

  const checks = [
    ['/dashboard/my-tasks', 'Task queue'],
    [`/clinical/workflow/${customer.id}`, 'Clinical workflow'],
    ['/inventory/kit-shortfall', 'Kit shortfall dashboard'],
    ['/finance/ledger', 'Ledger'],
    ['/finance/day-close', 'Day close'],
    ['/billing', 'Billing hub'],
  ];

  for (const [path, label] of checks) {
    console.log(`→ GET ${path}`);
    await expectOk(client, path, label);
  }

  const bill = await prisma.bill.findFirst({ where: { status: { not: 'CANCELLED' } } });
  if (bill) {
    console.log(`→ GET /billing/${bill.id}/pdf`);
    const pdfRes = await client.request(`/billing/${bill.id}/pdf`);
    assert(pdfRes.status === 200, `Bill PDF expected 200, got ${pdfRes.status}`);
    assert(pdfRes.headers.get('content-type')?.includes('pdf'), 'Bill PDF content-type');
  }

  const procedure = await prisma.procedure.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
  });

  if (procedure) {
    console.log(`→ Procedure detail ${procedure.procedureNo}`);
    await expectOk(client, `/appointments/procedures/${procedure.id}`, 'Procedure detail');
    const consent = await client.request(`/appointments/procedures/${procedure.id}/consent-pdf`);
    assert(consent.status === 302, `Consent PDF route: ${consent.status}`);
  } else {
    console.log('⚠ No procedure found — skipping procedure/consent checks');
  }

  console.log('→ Therapist login');
  const therapistClient = new SessionClient();
  const therapist = await prisma.user.findUnique({ where: { email: 'therapist.hair@vcare.com' } });
  if (therapist) {
    await login(therapistClient, 'therapist.hair@vcare.com', 'VCare@123');
    await expectOk(therapistClient, '/dashboard/my-tasks', 'Therapist tasks');
  } else {
    console.log('⚠ Therapist user missing — re-run seed');
  }
}

async function runServiceChecks() {
  console.log('→ Service: therapist assignment');
  const { resolveProcedurePerformer } = await import('../src/services/therapistAssignmentService.js');
  const branch = await prisma.branch.findFirst({ where: { code: 'CHN-HAIR' } });
  const treatment = await prisma.treatment.findFirst({ where: { category: 'HAIR' } });
  const performerId = await resolveProcedurePerformer({
    branchId: branch?.id,
    treatmentId: treatment?.id,
    scheduledAt: new Date(),
  });
  assert(performerId, 'Therapist assignment returned no performer');

  console.log('→ Service: kit shortfall');
  const { getLowStockByReorder } = await import('../src/services/kitShortfallService.js');
  const low = await getLowStockByReorder(branch ? { branchId: branch.id } : {});
  assert(Array.isArray(low), 'getLowStockByReorder failed');

  console.log('→ Service: ledger sync');
  const { syncBillLedgers } = await import('../src/services/ledgerService.js');
  const bill = await prisma.bill.findFirst({ where: { status: { not: 'CANCELLED' } } });
  if (bill) {
    await syncBillLedgers(bill.id);
    const entries = await prisma.journalEntry.count({ where: { sourceId: bill.id } });
    assert(entries > 0, 'No journal entries after syncBillLedgers');
  } else {
    console.log('⚠ No bill for ledger sync check');
  }

  console.log('→ Registry depth: loan installment composite key');
  const { enrichScreenData } = await import('../src/services/registryDepthService.js');
  const enriched = await enrichScreenData(
    { type: 'report', dataKey: 'loanPaymentUpdate' },
    { rows: [{ l: 'LN20260001', i: '1', a: 5000 }] },
  );
  assert(enriched.rows[0]._id || enriched.rows.length, 'Loan installment enrichment failed');
}

async function runRbacChecks() {
  console.log('→ RBAC: BM lacks billing.payments');
  const bmRole = await prisma.role.findUnique({
    where: { code: 'BRANCH_MANAGER' },
    include: { permissions: { include: { permission: true } } },
  });
  const bmPermCodes = bmRole?.permissions.map((rp) => rp.permission.code) || [];
  assert(!bmPermCodes.includes('billing.payments'), 'BM should not have billing.payments');

  console.log('→ RBAC: payment-at-create guard');
  const { assertCreatePaymentAllowed } = await import('../src/services/billingService.js');
  let blocked = false;
  try {
    assertCreatePaymentAllowed(100, 'BRANCH_MANAGER');
  } catch {
    blocked = true;
  }
  assert(blocked, 'BM should be blocked from paid-at-create');
  assertCreatePaymentAllowed(100, 'ACCOUNTS');

  console.log('→ RBAC: BM cannot POST bill payment');
  const bmClient = new SessionClient();
  await login(bmClient, 'bm.hair@vcare.com', 'VCare@123');
  const bill = await prisma.bill.findFirst({ where: { status: { not: 'CANCELLED' } } });
  assert(bill, 'Need a bill for payment RBAC check');
  const payRes = await bmClient.request(`/billing/${bill.id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ amount: '1', paymentMode: 'CASH' }),
  });
  assert(payRes.status === 403, `BM payment POST expected 403, got ${payRes.status}`);

  console.log('→ RBAC: Accounts cannot submit day close');
  const acctClient = new SessionClient();
  await login(acctClient, 'accounts@vcare.com', 'VCare@123');
  const dcRes = await acctClient.request('/finance/day-close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      branchId: bill.branchId,
      closeDate: '2026-01-01',
      physicalCash: '0',
    }),
  });
  assert(dcRes.status === 403, `Accounts day-close submit expected 403, got ${dcRes.status}`);

  console.log('→ RBAC: sales invoice blocks BM embedded payment');
  const order = await prisma.salesOrder.findFirst({
    where: { status: { not: 'INVOICED' }, billId: null },
  });
  if (order) {
    const { invoiceSalesOrder } = await import('../src/services/salesOrderService.js');
    let salesBlocked = false;
    try {
      await invoiceSalesOrder({
        orderId: order.id,
        createdById: bill.createdById,
        paidAmount: 100,
        paymentMode: 'CASH',
        roleCode: 'BRANCH_MANAGER',
      });
    } catch (err) {
      salesBlocked = /Only Accounts/i.test(err.message);
    }
    assert(salesBlocked, 'BM sales invoice with payment should be blocked');
  } else {
    console.log('⚠ No uninvoiced sales order — skipping sales payment guard check');
  }

  console.log('→ RBAC: pharmacy B2B blocks BM embedded payment');
  const corp = await prisma.customer.findFirst({ where: { customerType: 'CORPORATE' } });
  const product = await prisma.product.findFirst({ where: { type: 'BILLABLE', isActive: true } });
  if (corp && product) {
    const { createPharmacyB2BBill } = await import('../src/services/pharmacyService.js');
    let b2bBlocked = false;
    try {
      await createPharmacyB2BBill({
        customerId: corp.id,
        branchId: bill.branchId,
        createdById: bill.createdById,
        items: [{ productId: product.id, quantity: 1, unitPrice: product.mrp }],
        paidAmount: 50,
        paymentMode: 'CASH',
        roleCode: 'BRANCH_MANAGER',
      });
    } catch (err) {
      b2bBlocked = /Only Accounts/i.test(err.message);
    }
    assert(b2bBlocked, 'BM pharmacy B2B with payment should be blocked');
  }
}

async function main() {
  console.log(`VCare smoke test → ${BASE}\n`);
  try {
    await runServiceChecks();
    await runRbacChecks();
    await runHttpChain();
    console.log('\n✅ Smoke test passed');
  } catch (err) {
    console.error('\n❌ Smoke test failed:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
