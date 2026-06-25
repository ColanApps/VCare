import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { generateNumber, paginate, buildPagination } from '../utils/helpers.js';
import { createStandardBill, cancelBill, issueRefund, issueCreditNote, getCreditNotes, assertCreatePaymentAllowed, resolveBillBranchId, billListWhere } from '../services/billingService.js';
import { getProcedureBillPrefill, linkBillToProcedure } from '../services/clinicalWorkflowService.js';
import { assertDateNotLocked } from '../services/financeDayLockService.js';
import { notifyBillWorkflow } from '../services/workflowOrchestrationService.js';
import { createAdvanceReceipt, createLoanEstimate, approveLoan, payInstallment, applyAdvanceToBill, createBillInstallmentPlan } from '../services/loanService.js';
import { createPharmacyBill, createPharmacyB2BBill } from '../services/pharmacyService.js';
import { getApplicableDiscount } from '../services/discountService.js';
import {
  changeBillDate,
  changeBillConsultant,
  changePaymentMode,
  upgradeBill,
  createServiceB2BBill,
  createPermanentRefund,
  approvePermanentRefund,
  createCashDeposit,
  getBillMaintenanceLogs,
} from '../services/billMaintenanceService.js';
import { logAudit } from '../utils/audit.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';
import { upload, setUploadCategory, getPublicPath } from '../middleware/upload.js';
import {
  streamBillInvoicePdf,
  streamAdvanceReceiptPdf,
  getBillDocumentData,
} from '../services/documentPdfService.js';

const router = Router();
router.use(requireAuth, branchScope);

function buildBillIndexWhere(branchFilter, query = {}) {
  const clauses = [];
  const branchClause = billListWhere(branchFilter);
  if (Object.keys(branchClause).length) clauses.push(branchClause);
  if (query.status) clauses.push({ status: query.status });
  if (query.q) {
    clauses.push({
      OR: [
        { billNo: { contains: query.q } },
        { customer: { firstName: { contains: query.q } } },
        { customer: { uhid: { contains: query.q } } },
      ],
    });
  }
  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { AND: clauses };
}

router.get('/', requirePermission('billing.view'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page);
  const where = buildBillIndexWhere(req.branchFilter, req.query);

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: { customer: true, branch: true, createdBy: true },
      orderBy: { billDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.bill.count({ where }),
  ]);

  res.render('pages/billing/index.njk', {
    title: 'Bill Details',
    activeModule: 'billing',
    bills,
    pagination: buildPagination(total, page, limit),
    filters: req.query,
  });
});

router.get('/credit-notes', requirePermission('billing.refunds'), async (req, res) => {
  const creditNotes = await getCreditNotes();
  res.render('pages/billing/credit-notes.njk', {
    title: 'Refunds & Credit Notes',
    activeModule: 'billing',
    creditNotes,
  });
});

router.get('/create', requirePermission('billing.create'), async (req, res) => {
  const [customers, treatments, products, branches] = await Promise.all([
    prisma.customer.findMany({ where: req.branchFilter, take: 100 }),
    prisma.treatment.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true, type: 'BILLABLE' }, take: 100 }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const showBranchPicker = !req.session.user.branchId
    || ['SUPER_ADMIN', 'CORPORATE'].includes(req.session.user.roleCode);

  let preselectedCustomer = req.query.customerId;
  let preselectedProcedure = req.query.procedureId || null;
  let prefillItems = [];

  if (preselectedProcedure) {
    const prefill = await getProcedureBillPrefill(preselectedProcedure);
    if (prefill?.redirect) return res.redirect(prefill.redirect);
    if (prefill) {
      preselectedCustomer = prefill.customerId;
      prefillItems = prefill.items || [];
    }
  }

  const data = {
    customers,
    treatments,
    products,
    branches,
    showBranchPicker,
    preselectedCustomer,
    preselectedProcedure,
    prefillItems,
  };
  if (isHtmx(req)) return res.render('partials/forms/billing-create.njk', data);

  const { page, limit, skip } = paginate(req.query.page);
  const where = billListWhere(req.branchFilter);
  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: { customer: true, branch: true, createdBy: true },
      orderBy: { billDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.bill.count({ where }),
  ]);
  return res.render('pages/billing/index.njk', {
    title: 'Bill Details',
    activeModule: 'billing',
    bills,
    pagination: buildPagination(total, page, limit),
    filters: { q: '', status: '' },
    autoOpenModal: { title: 'Create Bill', size: 'full', url: '/billing/create' },
  });
});

router.post('/preview-discount', requirePermission('billing.create'), async (req, res) => {
  const { itemType, itemCode, unitPrice, quantity, category } = req.body;
  const type = ['TREATMENT', 'SERVICE'].includes(itemType) ? 'SERVICE' : 'PRODUCT';
  const lineAmount = parseFloat(unitPrice) * (parseInt(quantity, 10) || 1);
  const disc = await getApplicableDiscount({ type, category: category || 'ALL', targetId: itemCode, lineAmount });
  res.json(disc);
});

router.post('/create', requirePermission('billing.create'), async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.body.customerId } });
    if (!customer) throw new Error('Customer not found.');

    const branchId = resolveBillBranchId({
      bodyBranchId: req.body.branchId,
      userBranchId: req.session.user.branchId,
      customerBranchId: customer.branchId,
    });

    await assertDateNotLocked(branchId, new Date(), 'create bills');
    const rawItems = JSON.parse(req.body.items || '[]');
    if (!rawItems.length) {
      throw new Error('Add at least one line item to the bill.');
    }

    const { bill, billNo, installmentRate, installmentTenure } = await createStandardBill({
      customerId: req.body.customerId,
      branchId,
      createdById: req.session.user.id,
      roleCode: req.session.user.roleCode,
      rawItems,
      customerCategory: customer?.category,
      discount: req.body.discount,
      paidAmount: req.body.paidAmount,
      paymentMode: req.body.paymentMode,
      referenceNo: req.body.referenceNo,
      useInstallmentPlan: req.body.useInstallmentPlan,
      installmentRate: req.body.installmentRate,
      installmentTenure: req.body.installmentTenure,
    });

    if (req.body.useInstallmentPlan === 'on' && bill.balanceAmount > 0) {
      await createBillInstallmentPlan({
        billId: bill.id,
        interestRate: parseFloat(installmentRate) || 12,
        tenureMonths: parseInt(installmentTenure, 10) || 6,
        approvedById: req.session.user.id,
        autoApprove: true,
      });
    }

    const procedureId = req.body.procedureId || null;
    if (procedureId) await linkBillToProcedure(bill.id, procedureId);
    await notifyBillWorkflow({ bill, procedureId, userId: req.session.user.id });

    const msg = req.body.useInstallmentPlan === 'on' && bill.balanceAmount > 0
      ? `Bill ${billNo} created with installment plan for balance ${bill.balanceAmount}.`
      : `Bill ${billNo} created successfully.`;
    return htmxRedirect(req, res, {
      url: '/billing',
      flash: { type: 'success', message: msg },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/billing',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.get('/payments', requirePermission('billing.payments'), async (req, res) => {
  const payments = await prisma.payment.findMany({
    include: { bill: { include: { customer: true } } },
    orderBy: { paymentDate: 'desc' },
    take: 50,
  });
  res.render('pages/billing/payments.njk', { title: 'Payments', activeModule: 'billing', payments });
});

router.get('/advances', requirePermission('billing.advances'), async (req, res) => {
  const advances = await prisma.advanceReceipt.findMany({
    where: req.branchFilter,
    include: { customer: true, branch: true },
    orderBy: { createdAt: 'desc' },
  });
  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 100 });
  const outstandingBills = await prisma.bill.findMany({
    where: { ...req.branchFilter, balanceAmount: { gt: 0 }, status: { in: ['PENDING', 'PARTIAL'] } },
    include: { customer: true },
    orderBy: { billDate: 'desc' },
    take: 50,
  });
  res.render('pages/billing/advances.njk', {
    title: 'Advance Receipts',
    activeModule: 'billing',
    advances,
    customers,
    outstandingBills,
  });
});

router.post('/advances', requirePermission('billing.advances'), async (req, res) => {
  try {
    const branchId = req.body.branchId || req.session.user.branchId;
    await assertDateNotLocked(branchId, new Date(), 'record advances');
    const advance = await createAdvanceReceipt({
    customerId: req.body.customerId,
    branchId: req.body.branchId || req.session.user.branchId,
    amount: parseFloat(req.body.amount),
    paymentMode: req.body.paymentMode,
    notes: req.body.notes,
    createdById: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: `Advance ${advance.receiptNo} recorded.` };
  res.redirect('/billing/advances');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/billing/advances');
  }
});

router.post('/advances/apply', requirePermission('billing.advances'), async (req, res) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.body.billId } });
    if (bill) await assertDateNotLocked(bill.branchId, new Date(), 'apply advances');
    await applyAdvanceToBill({
      advanceId: req.body.advanceId,
      billId: req.body.billId,
      amount: parseFloat(req.body.amount),
      appliedById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Advance applied to bill.' };
    res.redirect(`/billing/${req.body.billId}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/billing/advances');
  }
});

router.get('/advances/:id/pdf', requirePermission('billing.advances'), async (req, res) => {
  try {
    await streamAdvanceReceiptPdf(req.params.id, res);
  } catch (err) {
    res.status(404).send(err.message);
  }
});

router.get('/loans', requirePermission('billing.loans'), async (req, res) => {
  const loans = await prisma.loanAccount.findMany({
    include: { customer: true, bill: true, installments: { orderBy: { installmentNo: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 100 });
  const bills = await prisma.bill.findMany({
    where: { ...req.branchFilter, balanceAmount: { gt: 0 } },
    include: { customer: true },
    take: 50,
  });
  res.render('pages/billing/loans.njk', { title: 'Loan Estimate & Approval', activeModule: 'billing', loans, customers, bills });
});

router.post('/loans', requirePermission('billing.loans'), async (req, res) => {
  const loan = await createLoanEstimate({
    customerId: req.body.customerId,
    billId: req.body.billId || null,
    principal: parseFloat(req.body.principal),
    interestRate: parseFloat(req.body.interestRate) || 12,
    tenureMonths: parseInt(req.body.tenureMonths, 10) || 6,
  });
  req.session.flash = { type: 'success', message: `Loan ${loan.loanNo} created — pending approval.` };
  res.redirect('/billing/loans');
});

router.post('/loans/:id/approve', requirePermission('billing.loans'), async (req, res) => {
  try {
    await approveLoan({ loanId: req.params.id, approvedById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Loan approved with installment schedule.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/billing/loans');
});

router.post('/loans/installments/:id/pay', requirePermission('billing.loans'), async (req, res) => {
  try {
    await payInstallment({ installmentId: req.params.id, amount: parseFloat(req.body.amount), paymentMode: req.body.paymentMode, referenceNo: req.body.referenceNo });
    req.session.flash = { type: 'success', message: 'Installment payment recorded.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/billing/loans');
});

router.get('/pharmacy', requirePermission('billing.pharmacy'), async (req, res) => {
  const [customers, products, recentBills] = await Promise.all([
    prisma.customer.findMany({ where: req.branchFilter, take: 100 }),
    prisma.product.findMany({ where: { type: 'BILLABLE', isActive: true } }),
    prisma.bill.findMany({ where: { billType: 'PHARMACY' }, include: { customer: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  res.render('pages/billing/pharmacy.njk', { title: 'Pharmacy Billing', activeModule: 'billing', customers, products, recentBills });
});

router.post('/pharmacy', requirePermission('billing.pharmacy'), async (req, res) => {
  try {
    assertCreatePaymentAllowed(req.body.paidAmount, req.session.user.roleCode);
    const customer = await prisma.customer.findUnique({ where: { id: req.body.customerId } });
    if (!customer) throw new Error('Customer not found.');
    const branchId = resolveBillBranchId({
      bodyBranchId: req.body.branchId,
      userBranchId: req.session.user.branchId,
      customerBranchId: customer.branchId,
    });
    const items = JSON.parse(req.body.items || '[]');
    const bill = await createPharmacyBill({
      customerId: req.body.customerId,
      branchId,
      createdById: req.session.user.id,
      items,
      paymentMode: req.body.paymentMode,
      paidAmount: parseFloat(req.body.paidAmount) || 0,
      roleCode: req.session.user.roleCode,
    });
    await notifyBillWorkflow({ bill, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: `Pharmacy bill ${bill.billNo} created.` };
    res.redirect(`/billing/${bill.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/billing/pharmacy');
  }
});

router.get('/pharmacy-b2b', requirePermission('billing.pharmacy.b2b'), async (req, res) => {
  const [corporateCustomers, products, recentBills] = await Promise.all([
    prisma.customer.findMany({ where: { customerType: 'CORPORATE', ...req.branchFilter }, take: 100 }),
    prisma.product.findMany({ where: { type: 'BILLABLE', isActive: true } }),
    prisma.bill.findMany({
      where: { billType: 'PHARMACY', source: 'B2B' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  res.render('pages/billing/pharmacy-b2b.njk', {
    title: 'Pharmacy B2B Invoicing',
    activeModule: 'billing',
    corporateCustomers,
    products,
    recentBills,
  });
});

router.post('/pharmacy-b2b', requirePermission('billing.pharmacy.b2b'), async (req, res) => {
  try {
    assertCreatePaymentAllowed(req.body.paidAmount, req.session.user.roleCode);
    const customer = await prisma.customer.findUnique({ where: { id: req.body.customerId } });
    if (!customer) throw new Error('Customer not found.');
    const branchId = resolveBillBranchId({
      bodyBranchId: req.body.branchId,
      userBranchId: req.session.user.branchId,
      customerBranchId: customer.branchId,
    });
    const items = JSON.parse(req.body.items || '[]');
    const bill = await createPharmacyB2BBill({
      customerId: req.body.customerId,
      branchId,
      createdById: req.session.user.id,
      items,
      paymentMode: req.body.paymentMode,
      paidAmount: parseFloat(req.body.paidAmount) || 0,
      buyerGstin: req.body.buyerGstin,
      poReference: req.body.poReference,
      creditDays: parseInt(req.body.creditDays, 10) || null,
      roleCode: req.session.user.roleCode,
    });
    await notifyBillWorkflow({ bill, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: `B2B invoice ${bill.billNo} created.` };
    res.redirect(`/billing/${bill.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/billing/pharmacy-b2b');
  }
});

router.get('/service-b2b', requirePermission('billing.service.b2b'), async (req, res) => {
  const [corporateCustomers, treatments, recentBills] = await Promise.all([
    prisma.customer.findMany({ where: { customerType: 'CORPORATE', ...req.branchFilter }, take: 100 }),
    prisma.treatment.findMany({ where: { isActive: true } }),
    prisma.bill.findMany({
      where: { billType: 'SERVICE', source: 'B2B' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  res.render('pages/billing/service-b2b.njk', {
    title: 'Service B2B Invoice',
    activeModule: 'billing',
    corporateCustomers,
    treatments,
    recentBills,
  });
});

router.post('/service-b2b', requirePermission('billing.service.b2b'), async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.body.customerId } });
    if (!customer) throw new Error('Customer not found.');
    const branchId = resolveBillBranchId({
      bodyBranchId: req.body.branchId,
      userBranchId: req.session.user.branchId,
      customerBranchId: customer.branchId,
    });
    const items = JSON.parse(req.body.items || '[]');
    const bill = await createServiceB2BBill({
      customerId: req.body.customerId,
      branchId,
      createdById: req.session.user.id,
      roleCode: req.session.user.roleCode,
      items,
      buyerGstin: req.body.buyerGstin,
      poReference: req.body.poReference,
      paidAmount: req.body.paidAmount,
      paymentMode: req.body.paymentMode,
    });
    await notifyBillWorkflow({ bill, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: `Service B2B invoice ${bill.billNo} created.` };
    res.redirect(`/billing/${bill.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/billing/service-b2b');
  }
});

router.get('/permanent-refunds', requirePermission('billing.refunds'), async (req, res) => {
  const refunds = await prisma.permanentRefund.findMany({
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });
  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 200 });
  res.render('pages/billing/permanent-refunds.njk', {
    title: 'Permanent Refunds',
    activeModule: 'billing',
    refunds,
    customers,
  });
});

router.post('/permanent-refunds', requirePermission('billing.refunds'), setUploadCategory('claims'), upload.single('attachment'), async (req, res) => {
  await createPermanentRefund({
    customerId: req.body.customerId,
    billId: req.body.billId || null,
    amount: req.body.amount,
    reason: req.body.reason,
    createdById: req.session.user.id,
    attachmentPath: req.file ? getPublicPath(req.file.filename, 'claims') : null,
  });
  req.session.flash = { type: 'success', message: 'Permanent refund request created.' };
  res.redirect('/billing/permanent-refunds');
});

router.post('/permanent-refunds/:id/approve', requirePermission('billing.refunds'), async (req, res) => {
  try {
    await approvePermanentRefund({ refundId: req.params.id, approvedById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Refund approved and financial entries posted.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/billing/permanent-refunds');
});

router.get('/cash-deposits', requirePermission('billing.advances'), async (req, res) => {
  const deposits = await prisma.cashDeposit.findMany({
    where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
    include: { customer: true, branch: true },
    orderBy: { createdAt: 'desc' },
  });
  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 200 });
  res.render('pages/billing/cash-deposits.njk', {
    title: 'Cash Deposits',
    activeModule: 'billing',
    deposits,
    customers,
  });
});

router.post('/cash-deposits', requirePermission('billing.advances'), setUploadCategory('claims'), upload.single('proof'), async (req, res) => {
  await createCashDeposit({
    customerId: req.body.customerId,
    branchId: req.body.branchId || req.session.user.branchId,
    amount: req.body.amount,
    purpose: req.body.purpose,
    paymentMode: req.body.paymentMode,
    createdById: req.session.user.id,
    proofPath: req.file ? getPublicPath(req.file.filename, 'claims') : null,
  });
  req.session.flash = { type: 'success', message: 'Cash deposit recorded.' };
  res.redirect('/billing/cash-deposits');
});

router.get('/:id/pdf', requirePermission('billing.view'), async (req, res) => {
  try {
    await streamBillInvoicePdf(req.params.id, res);
  } catch (err) {
    res.status(404).send(err.message);
  }
});

router.get('/:id/print', requirePermission('billing.view'), async (req, res) => {
  try {
    const bill = await getBillDocumentData(req.params.id);
    res.render('pages/billing/print-invoice.njk', {
      title: `Invoice ${bill.billNo}`,
      layout: 'layouts/print.njk',
      bill,
    });
  } catch (err) {
    res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: err.message });
  }
});

router.get('/:id', requirePermission('billing.view'), async (req, res) => {
  const bill = await prisma.bill.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      branch: true,
      createdBy: true,
      items: true,
      payments: true,
      creditNotes: true,
      loanAccounts: { include: { installments: { orderBy: { installmentNo: 'asc' } } } },
    },
  });
  if (!bill) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Bill not found' });

  const advances = bill.balanceAmount > 0
    ? await prisma.advanceReceipt.findMany({
        where: { customerId: bill.customerId, status: 'ACTIVE', balanceAmount: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const activeLoan = bill.loanAccounts.find((l) => ['PENDING', 'ACTIVE'].includes(l.status));

  const [maintenanceLogs, consultants, treatments] = await Promise.all([
    getBillMaintenanceLogs(bill.id),
    prisma.user.findMany({ where: { role: { code: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } }, isActive: true }, take: 30 }),
    prisma.treatment.findMany({ where: { isActive: true }, take: 50 }),
  ]);

  res.render('pages/billing/detail.njk', {
    title: `Bill ${bill.billNo}`,
    activeModule: 'billing',
    bill,
    advances,
    activeLoan,
    maintenanceLogs,
    consultants,
    treatments,
  });
});

router.post('/:id/payment', requirePermission('billing.payments', 'billing.create'), async (req, res) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) {
      req.session.flash = { type: 'error', message: 'Bill not found.' };
      return res.redirect('/billing');
    }
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      throw new Error('Enter a valid payment amount.');
    }

    const { recordPayment } = await import('../services/paymentService.js');
    const { payment } = await recordPayment({
      billId: bill.id,
      amount,
      paymentMode: req.body.paymentMode,
      referenceNo: req.body.referenceNo,
      userId: req.session.user.id,
    });

    req.session.flash = { type: 'success', message: 'Payment recorded.' };
    if (req.body.printReceipt === 'on') {
      return res.redirect(`/finance/receipt/${payment.id}?print=1`);
    }
    return res.redirect(`/billing/${bill.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    return res.redirect(`/billing/${req.params.id}`);
  }
});

router.post('/:id/installment-plan', requirePermission('billing.installments'), async (req, res) => {
  try {
    const loan = await createBillInstallmentPlan({
      billId: req.params.id,
      interestRate: parseFloat(req.body.interestRate) || 12,
      tenureMonths: parseInt(req.body.tenureMonths, 10) || 6,
      approvedById: req.session.user.id,
      autoApprove: req.body.autoApprove !== 'off',
      provider: req.body.provider || 'INTERNAL',
      externalRefNo: req.body.externalRefNo || null,
    });
    const providerLabel = loan.provider === 'BAJAJ' ? 'Bajaj' : 'Internal';
    req.session.flash = { type: 'success', message: `${providerLabel} installment plan ${loan.loanNo} created with ${loan.installments?.length || 0} EMIs.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/cancel', requirePermission('billing.cancel'), async (req, res) => {
  try {
    await cancelBill({ billId: req.params.id, reason: req.body.reason, userId: req.session.user.id });
    await logAudit({ userId: req.session.user.id, action: 'CANCEL', module: 'BILLING', entityType: 'Bill', entityId: req.params.id, ipAddress: req.ip });
    req.session.flash = { type: 'success', message: 'Bill cancelled successfully.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/refund', requirePermission('billing.refunds'), async (req, res) => {
  try {
    await issueRefund({ billId: req.params.id, amount: parseFloat(req.body.amount), reason: req.body.reason, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Refund processed.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/credit-note', requirePermission('billing.refunds'), async (req, res) => {
  try {
    const cn = await issueCreditNote({ billId: req.params.id, amount: parseFloat(req.body.amount), reason: req.body.reason, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: `Credit note ${cn.creditNoteNo} issued.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/change-date', requirePermission('billing.maintenance'), async (req, res) => {
  try {
    await changeBillDate({ billId: req.params.id, billDate: req.body.billDate, reason: req.body.reason, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Bill date updated.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/change-consultant', requirePermission('billing.maintenance'), async (req, res) => {
  try {
    await changeBillConsultant({ billId: req.params.id, consultantId: req.body.consultantId, reason: req.body.reason, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Consultant updated on bill.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/change-payment-mode', requirePermission('billing.maintenance'), async (req, res) => {
  try {
    await changePaymentMode({ billId: req.params.id, paymentMode: req.body.paymentMode, reason: req.body.reason, userId: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Payment mode updated.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/upgrade', requirePermission('billing.maintenance'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const bill = await upgradeBill({
      originalBillId: req.params.id,
      items,
      userId: req.session.user.id,
      upgradeBy: req.body.upgradeBy || 'CONSULTANT',
      notes: req.body.notes,
    });
    req.session.flash = { type: 'success', message: `Upgrade bill ${bill.billNo} created.` };
    res.redirect(`/billing/${bill.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(`/billing/${req.params.id}`);
  }
});

export default router;
