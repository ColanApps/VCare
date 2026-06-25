import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { parseReportPeriod, branchWhere } from '../utils/reportFilters.js';
import { getGstSummary, getGstB2C, getGstB2B, getGstDayWise } from '../services/gstReportService.js';
import { getBranchComparison, getInventoryAging, getConsultantDetail, getPendingAdvanceReport, getLoanReport, getProductServiceSales, getDiscontinuedCustomers, getRefundCreditReport, getCollectionReport, getAppointmentVisitReport, getNotJoinedReport } from '../services/reportService.js';
import { getConsultantIncentiveReport, getBranchManagerIncentiveReport, getDayTargetAchievementReport } from '../services/incentiveService.js';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/sales', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const branchId = req.query.branchId;
  const bills = await prisma.bill.findMany({
    where: {
      ...branchWhere(req.branchFilter, branchId),
      billDate: { gte: period.from, lte: period.to },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
    },
    include: { customer: true, branch: true, items: true },
    orderBy: { billDate: 'desc' },
  });

  const summary = {
    totalRevenue: bills.reduce((s, b) => s + b.totalAmount, 0),
    totalCollected: bills.reduce((s, b) => s + b.paidAmount, 0),
    billCount: bills.length,
    byBranch: {},
    byPaymentMode: {},
  };

  for (const bill of bills) {
    const branch = bill.branch?.name || 'Unknown';
    summary.byBranch[branch] = (summary.byBranch[branch] || 0) + bill.totalAmount;
    const mode = bill.paymentMode || 'UNSPECIFIED';
    summary.byPaymentMode[mode] = (summary.byPaymentMode[mode] || 0) + bill.totalAmount;
  }
  summary.paymentModes = Object.entries(summary.byPaymentMode).map(([mode, amount]) => ({
    mode,
    amount,
    pct: summary.totalRevenue > 0 ? (amount / summary.totalRevenue) * 100 : 0,
  }));

  res.render('pages/reports/sales.njk', {
    title: 'Sales Report',
    activeModule: 'reports',
    bills,
    summary,
    period,
    branches: await prisma.branch.findMany({ where: { isActive: true } }),
    filters: req.query,
  });
});

router.get('/sales/export', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const branchId = req.query.branchId;
  const bills = await prisma.bill.findMany({
    where: {
      ...branchWhere(req.branchFilter, branchId),
      billDate: { gte: period.from, lte: period.to },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
    },
    include: { customer: true, branch: true },
    orderBy: { billDate: 'desc' },
  });

  const lines = [
    ['Bill No', 'Date', 'Customer', 'UHID', 'Branch', 'Total', 'Paid', 'Balance', 'Status', 'Payment Mode'].join(','),
    ...bills.map((b) => [
      b.billNo,
      b.billDate?.toISOString?.().slice(0, 10) || '',
      `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.trim(),
      b.customer?.uhid || '',
      b.branch?.name || '',
      b.totalAmount,
      b.paidAmount,
      b.balanceAmount,
      b.status,
      b.paymentMode || '',
    ].map((v) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');
  res.send(lines.join('\n'));
});

router.get('/customers', requirePermission('reports.customers'), async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: req.branchFilter,
    include: {
      branch: true,
      _count: { select: { appointments: true, bills: true, consultations: true } },
    },
    orderBy: { registeredAt: 'desc' },
    take: 100,
  });
  res.render('pages/reports/customers.njk', { title: 'Customer Report', activeModule: 'reports', customers });
});

router.get('/consultants', requirePermission('reports.consultants'), async (req, res) => {
  const period = parseReportPeriod(req.query);

  const consultants = await prisma.user.findMany({
    where: { role: { code: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } } },
    include: { branch: true },
  });

  const performance = await Promise.all(
    consultants.map(async (c) => {
      const [bills, appointments] = await Promise.all([
        prisma.bill.aggregate({
          where: { createdById: c.id, billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
          _sum: { totalAmount: true },
          _count: true,
        }),
        prisma.appointment.count({
          where: { consultantId: c.id, scheduledAt: { gte: period.from, lte: period.to } },
        }),
      ]);
      return {
        ...c,
        revenue: bills._sum.totalAmount || 0,
        billCount: bills._count,
        appointments,
      };
    })
  );

  res.render('pages/reports/consultants.njk', {
    title: 'Consultant Performance',
    activeModule: 'reports',
    performance: performance.sort((a, b) => b.revenue - a.revenue),
    period,
  });
});

router.get('/consultants/:id', requirePermission('reports.consultants'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const detail = await getConsultantDetail(req.params.id, period.from, period.to);
  if (!detail) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Consultant not found' });
  res.render('pages/reports/consultant-detail.njk', {
    title: `${detail.consultant.firstName} ${detail.consultant.lastName} — Performance`,
    activeModule: 'reports',
    ...detail,
    period,
  });
});

router.get('/gst', requirePermission('reports.gst'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const data = await getGstSummary(req.branchFilter, period.from, period.to);
  res.render('pages/reports/gst.njk', {
    title: 'GST Summary (HSN)',
    activeModule: 'reports',
    ...data,
    period,
  });
});

router.get('/gst-b2c', requirePermission('reports.gst'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const bills = await getGstB2C(req.branchFilter, period.from, period.to);
  const total = bills.reduce((s, b) => s + b.totalAmount, 0);
  const totalTax = bills.reduce((s, b) => s + b.taxAmount, 0);
  res.render('pages/reports/gst-b2c.njk', { title: 'GST Report — B2C', activeModule: 'reports', bills, total, totalTax, period });
});

router.get('/gst-b2b', requirePermission('reports.gst'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const bills = await getGstB2B(req.branchFilter, period.from, period.to);
  const total = bills.reduce((s, b) => s + b.totalAmount, 0);
  const totalTax = bills.reduce((s, b) => s + b.taxAmount, 0);
  res.render('pages/reports/gst-b2b.njk', { title: 'GST Report — B2B', activeModule: 'reports', bills, total, totalTax, period });
});

router.get('/gst-daywise', requirePermission('reports.gst'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const rows = await getGstDayWise(req.branchFilter, period.from, period.to);
  const totals = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    tax: acc.tax + r.tax,
    total: acc.total + r.total,
  }), { bills: 0, tax: 0, total: 0 });
  res.render('pages/reports/gst-daywise.njk', { title: 'Day Wise GST Report', activeModule: 'reports', rows, totals, period });
});

router.get('/targets', requirePermission('reports.targets'), async (req, res) => {
  const period = parseReportPeriod(req.query);

  const targets = await prisma.locationTarget.findMany({
    where: { month: period.month, year: period.year },
    include: { branch: true },
  });

  const achievement = await Promise.all(
    targets.map(async (t) => {
      const sales = await prisma.bill.aggregate({
        where: { branchId: t.branchId, billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { totalAmount: true },
      });
      const achieved = sales._sum.totalAmount || 0;
      return { ...t, achieved, progress: t.target > 0 ? (achieved / t.target) * 100 : 0 };
    })
  );

  res.render('pages/reports/targets.njk', { title: 'Target Achievement', activeModule: 'reports', achievement, period });
});

router.get('/branch-comparison', requirePermission('reports.branches'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const { rows, totals } = await getBranchComparison(period.from, period.to);
  res.render('pages/reports/branch-comparison.njk', {
    title: 'Branch Comparison',
    activeModule: 'reports',
    rows,
    totals,
    period,
  });
});

router.get('/inventory-aging', requirePermission('reports.inventory'), async (req, res) => {
  const { buckets, summary, allItems } = await getInventoryAging(req.branchFilter);
  res.render('pages/reports/inventory-aging.njk', {
    title: 'Inventory Aging',
    activeModule: 'reports',
    buckets,
    summary,
    allItems,
  });
});

router.get('/pending-advances', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const { advances, total } = await getPendingAdvanceReport(req.branchFilter, period.from, period.to);
  res.render('pages/reports/pending-advances.njk', { title: 'Pending Advance Report', activeModule: 'reports', advances, total, period });
});

router.get('/loans', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const { loans, summary } = await getLoanReport(period.from, period.to);
  res.render('pages/reports/loans.njk', { title: 'Loan Report', activeModule: 'reports', loans, summary, period });
});

router.get('/product-service-sales', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const rows = await getProductServiceSales(period.from, period.to, req.branchFilter);
  res.render('pages/reports/product-service-sales.njk', { title: 'Product / Service Sales', activeModule: 'reports', rows, period });
});

router.get('/discontinued', requirePermission('reports.customers'), async (req, res) => {
  const customers = await getDiscontinuedCustomers(req.branchFilter);
  res.render('pages/reports/discontinued.njk', { title: 'Discontinued Clients', activeModule: 'reports', customers });
});

router.get('/refunds', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const { creditNotes, total } = await getRefundCreditReport(period.from, period.to, req.branchFilter);
  res.render('pages/reports/refunds.njk', { title: 'Refund & Credit Note Report', activeModule: 'reports', creditNotes, total, period });
});

router.get('/collection', requirePermission('reports.sales'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const rows = await getCollectionReport(period.from, period.to, req.branchFilter);
  res.render('pages/reports/collection.njk', { title: 'Branch Collection Report', activeModule: 'reports', rows, period });
});

router.get('/appointments-visits', requirePermission('reports.customers'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const data = await getAppointmentVisitReport(period.from, period.to, req.branchFilter);
  res.render('pages/reports/appointments-visits.njk', { title: 'Appointments & Visits', activeModule: 'reports', ...data, period });
});

router.get('/not-joined', requirePermission('reports.customers'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const customers = await getNotJoinedReport(period.from, period.to, req.branchFilter);
  res.render('pages/reports/not-joined.njk', { title: 'Treatment Not Joined', activeModule: 'reports', customers, period });
});

router.get('/incentives/consultants', requirePermission('reports.incentives'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const rows = await getConsultantIncentiveReport(period.month, period.year);
  const totalIncentive = rows.reduce((s, r) => s + r.incentive, 0);
  res.render('pages/reports/incentives-consultants.njk', {
    title: 'Consultant Incentives',
    activeModule: 'reports',
    rows,
    totalIncentive,
    period,
  });
});

router.get('/incentives/branch-managers', requirePermission('reports.incentives'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const rows = await getBranchManagerIncentiveReport(period.month, period.year);
  const totalIncentive = rows.reduce((s, r) => s + r.incentive, 0);
  res.render('pages/reports/incentives-branch-managers.njk', {
    title: 'Branch Manager Incentives',
    activeModule: 'reports',
    rows,
    totalIncentive,
    period,
  });
});

router.get('/incentives/day-targets', requirePermission('reports.incentives'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const rows = await getDayTargetAchievementReport(period.month, period.year, req.branchFilter);
  res.render('pages/reports/incentives-day-targets.njk', {
    title: 'Day Target Achievement',
    activeModule: 'reports',
    rows,
    period,
  });
});

export default router;
