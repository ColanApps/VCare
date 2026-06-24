import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { getGstExportPack, getReceiptVoucherData, getArAging, getDayClosePreview, submitDayClose, approveDayClose, lockDayClose, getFinanceHubSummary, createIncentivePayoutsFromUpload, approveIncentivePayout, markIncentivePaid } from '../services/financeClosureService.js';
import { getLedgerEntries } from '../services/ledgerService.js';
import { rowsToCsv } from '../services/registryDepthService.js';
import { streamPaymentReceiptPdf } from '../services/documentPdfService.js';
import { upload, setUploadCategory, getPublicPath } from '../middleware/upload.js';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/', requirePermission('finance.view'), async (req, res) => {
  const summary = await getFinanceHubSummary(req.branchFilter);
  res.render('pages/finance/index.njk', {
    title: 'Finance Hub',
    activeModule: 'finance',
    summary,
  });
});

router.get('/ar-aging', requirePermission('finance.view'), async (req, res) => {
  const aging = await getArAging(req.branchFilter);
  res.render('pages/finance/ar-aging.njk', {
    title: 'AR Aging',
    activeModule: 'finance',
    aging,
  });
});

router.get('/day-close', requirePermission('finance.close.submit', 'finance.close.approve'), async (req, res) => {
  const branchId = req.query.branchId || req.session.user.branchId;
  const branches = req.session.user.roleCode === 'SUPER_ADMIN' || !req.session.user.branchId
    ? await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } })
    : [];
  const closeDate = req.query.date || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let preview = null;
  if (branchId) {
    preview = await getDayClosePreview(branchId, closeDate);
  }
  const pendingApproval = await prisma.dayClose.findMany({
    where: { ...req.branchFilter, status: 'SUBMITTED' },
    include: { branch: true, closedBy: true },
    orderBy: { closeDate: 'desc' },
    take: 20,
  });
  res.render('pages/finance/day-close.njk', {
    title: 'Day Close',
    activeModule: 'finance',
    branches,
    branchId,
    closeDate,
    preview,
    pendingApproval,
  });
});

router.post('/day-close', requirePermission('finance.close.submit'), async (req, res) => {
  try {
    const branchId = req.body.branchId || req.session.user.branchId;
    await submitDayClose({
      branchId,
      closeDate: req.body.closeDate,
      physicalCash: req.body.physicalCash,
      notes: req.body.notes,
      userId: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Day close submitted for approval.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/finance/day-close');
});

router.post('/day-close/:id/approve', requirePermission('finance.close.approve'), async (req, res) => {
  try {
    await approveDayClose(req.params.id, req.session.user.id, { roleCode: req.session.user.roleCode });
    req.session.flash = { type: 'success', message: 'Day close approved.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/finance/day-close');
});

router.post('/day-close/:id/lock', requirePermission('finance.close.approve'), async (req, res) => {
  try {
    await lockDayClose(req.params.id, req.session.user.id, { roleCode: req.session.user.roleCode });
    req.session.flash = { type: 'success', message: 'Period locked.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/finance/day-close');
});

router.get('/incentives', requirePermission('finance.incentives'), async (req, res) => {
  const [uploads, payouts] = await Promise.all([
    prisma.incentiveUpload.findMany({ orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }], take: 24 }),
    prisma.incentivePayout.findMany({
      include: { consultant: true, upload: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  res.render('pages/finance/incentives.njk', {
    title: 'Incentive Payouts',
    activeModule: 'finance',
    uploads,
    payouts,
  });
});

router.post('/incentives/upload/:id/calculate', requirePermission('finance.incentives'), async (req, res) => {
  try {
    const { processIncentiveUpload } = await import('../services/incentiveWorkflowService.js');
    await processIncentiveUpload(req.params.id);
    const result = await createIncentivePayoutsFromUpload(req.params.id);
    req.session.flash = { type: 'success', message: `Created ${result.payouts.length} payout lines (₹${result.total.toFixed(2)}).` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/finance/incentives');
});

router.post('/incentives/payout/:id/approve', requirePermission('finance.incentives'), async (req, res) => {
  await approveIncentivePayout(req.params.id, req.session.user.id);
  req.session.flash = { type: 'success', message: 'Payout approved.' };
  res.redirect('/finance/incentives');
});

router.post('/incentives/payout/:id/pay', requirePermission('finance.incentives'), async (req, res) => {
  await markIncentivePaid(req.params.id, req.body.paymentRef);
  req.session.flash = { type: 'success', message: 'Payout marked paid.' };
  res.redirect('/finance/incentives');
});

router.get('/gst-export', requirePermission('reports.gst'), async (req, res) => {
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const pack = await getGstExportPack(req.branchFilter, month, year);
  if (req.query.format === 'csv') {
    const columns = [['Bill No', 'billNo'], ['Date', 'billDate'], ['Customer', 'customerName'], ['GSTIN', 'gstin'], ['Taxable', 'subtotal'], ['Tax', 'taxAmount'], ['Total', 'totalAmount']];
    const rows = pack.bills.map((b) => ({
      billNo: b.billNo,
      billDate: b.billDate,
      customerName: `${b.customer.firstName} ${b.customer.lastName}`,
      gstin: b.customer.gstin || b.buyerGstin || '',
      subtotal: b.subtotal,
      taxAmount: b.taxAmount,
      totalAmount: b.totalAmount,
    }));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gst-${year}-${month}.csv"`);
    return res.send(rowsToCsv(columns, rows));
  }
  res.render('pages/finance/gst-export.njk', {
    title: 'GST Export',
    activeModule: 'finance',
    pack,
    month,
    year,
  });
});

router.get('/advance-audit', requirePermission('finance.view'), async (req, res) => {
  const applications = await prisma.advanceApplication.findMany({
    where: req.branchFilter.branchId ? { bill: { branchId: req.branchFilter.branchId } } : {},
    include: {
      advance: true,
      bill: { include: { customer: true } },
      appliedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { appliedAt: 'desc' },
    take: 200,
  });
  const totalApplied = applications.reduce((s, a) => s + a.amount, 0);
  res.render('pages/finance/advance-audit.njk', {
    title: 'Advance Application Audit',
    activeModule: 'finance',
    applications,
    totalApplied,
  });
});

router.get('/ledger', requirePermission('finance.view'), async (req, res) => {
  const entries = await getLedgerEntries({ branchFilter: req.branchFilter, limit: 200 });
  res.render('pages/finance/ledger.njk', {
    title: 'General Ledger',
    activeModule: 'finance',
    entries,
  });
});

router.get('/receipt/:paymentId', requirePermission('billing.payments'), async (req, res) => {
  const data = await getReceiptVoucherData(req.params.paymentId);
  if (!data) {
    return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Payment not found.' });
  }
  res.render('pages/finance/receipt.njk', {
    title: `Receipt ${data.receiptNo}`,
    activeModule: 'finance',
    layout: req.query.print ? 'layouts/print.njk' : 'layouts/main.njk',
  ...data,
  });
});

router.get('/receipt/:paymentId/pdf', requirePermission('billing.payments'), async (req, res) => {
  try {
    await streamPaymentReceiptPdf(req.params.paymentId, res);
  } catch (err) {
    res.status(404).send(err.message);
  }
});

router.post('/incentives/upload', requirePermission('finance.incentives'), setUploadCategory('incentives'), upload.single('file'), async (req, res) => {
  try {
    const periodMonth = parseInt(req.body.periodMonth, 10);
    const periodYear = parseInt(req.body.periodYear, 10);
    if (!periodMonth || !periodYear) throw new Error('Period month and year are required');
    await prisma.incentiveUpload.create({
      data: {
        periodMonth,
        periodYear,
        notes: req.body.notes || null,
        filePath: req.file ? getPublicPath(req.file.filename, 'incentives') : null,
        uploadedById: req.session.user.id,
      },
    });
    req.session.flash = { type: 'success', message: 'Incentive upload batch created.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/finance/incentives');
});

export default router;
