import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';

import { requirePermission, branchScope } from '../middleware/rbac.js';

import { getExecutiveDashboard, getInflowSales } from '../services/dashboardService.js';
import { getBranchesWithMonthStats } from '../services/targetService.js';
import { parseReportPeriod } from '../utils/reportFilters.js';
import { getTodayAttendance } from '../services/biometricService.js';
import { prisma } from '../lib/prisma.js';



const router = Router();

router.use(requireAuth, branchScope);

router.get('/role-home', async (req, res) => {
  const { getRoleHomeData } = await import('../services/roleHomeService.js');
  const home = await getRoleHomeData(req.session.user, req.branchFilter);
  const topTasks = home.queue.sections.flatMap((s) => s.tasks).slice(0, 8);
  res.render('pages/dashboard/role-home.njk', {
    title: 'Role Home',
    activeModule: 'dashboard',
    ...home,
    topTasks,
  });
});

router.get('/my-tasks', async (req, res) => {
  const { getRoleTaskQueue } = await import('../services/taskQueueService.js');
  const { getRoleJourneyGuide } = await import('../services/roleJourneyService.js');
  const queue = await getRoleTaskQueue(req.session.user, req.branchFilter);
  const guide = getRoleJourneyGuide(req.session.user.roleCode);
  res.render('pages/dashboard/my-tasks.njk', {
    title: 'My Tasks',
    activeModule: 'dashboard',
    queue,
    guide,
  });
});

router.get('/journey/:customerId', requirePermission('customer.view'), async (req, res) => {
  const { getCustomerJourney } = await import('../services/roleJourneyService.js');
  const journey = await getCustomerJourney(req.params.customerId);
  if (!journey) {
    return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Customer not found.' });
  }
  res.render('pages/dashboard/customer-journey.njk', {
    title: `Journey — ${journey.customer.name}`,
    activeModule: 'customer',
    journey,
  });
});

router.get('/', requirePermission('dashboard.view'), async (req, res) => {

  const data = await getExecutiveDashboard(req.branchFilter);

  res.render('pages/dashboard/index.njk', {

    title: 'Executive Dashboard',

    activeModule: 'dashboard',

    ...data,

  });

});



router.get('/inflow', requirePermission('dashboard.inflow'), async (req, res) => {

  const period = parseReportPeriod(req.query);

  const inflow = await getInflowSales(req.branchFilter, period.from, period.to);

  res.render('pages/dashboard/inflow.njk', {

    title: 'Inflow Sales',

    activeModule: 'dashboard',

    inflow,

    period,

  });

});



router.get('/day-sales', requirePermission('dashboard.sales'), async (req, res) => {

  const period = parseReportPeriod(req.query);

  const bills = await prisma.bill.findMany({

    where: {

      ...req.branchFilter,

      billDate: { gte: period.from, lte: period.to },

      status: { notIn: ['CANCELLED', 'DRAFT'] },

    },

    include: { customer: true, branch: true, createdBy: true },

    orderBy: { billDate: 'desc' },

  });

  const total = bills.reduce((s, b) => s + b.totalAmount, 0);

  res.render('pages/dashboard/day-sales.njk', {

    title: 'Day Sales',

    activeModule: 'dashboard',

    bills,

    total,

    date: period.date || period.from,

    dateIso: (period.date || period.from).toISOString().split('T')[0],

    period,

  });

});



router.get('/branch', requirePermission('dashboard.branch'), async (req, res) => {

  const period = parseReportPeriod(req.query);

  const branches = await getBranchesWithMonthStats(period.month, period.year);

  res.render('pages/dashboard/branch.njk', {

    title: 'Branch Report',

    activeModule: 'dashboard',

    branches,

    period,

  });

});



router.get('/treatment', requirePermission('dashboard.treatment'), async (req, res) => {

  const period = parseReportPeriod(req.query);

  const procedureWhere = {

    scheduledAt: { gte: period.from, lte: period.to },

    ...(req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {}),

  };

  const procedures = await prisma.procedure.findMany({

    where: procedureWhere,

    include: { customer: true },

    orderBy: { scheduledAt: 'asc' },

    take: 100,

  });

  const appointments = await prisma.appointment.findMany({

    where: {

      ...req.branchFilter,

      type: 'TREATMENT',

      scheduledAt: { gte: period.from, lte: period.to },

    },

    include: { customer: true, consultant: true },

    orderBy: { scheduledAt: 'asc' },

    take: 100,

  });

  res.render('pages/dashboard/treatment.njk', {

    title: 'Treatment Status',

    activeModule: 'dashboard',

    procedures,

    appointments,

    period,

  });

});

router.get('/biometric', requirePermission('dashboard.biometric'), async (req, res) => {
  const attendance = await getTodayAttendance(req.branchFilter);
  res.render('pages/dashboard/biometric.njk', {
    title: 'Biometric Attendance',
    activeModule: 'dashboard',
    ...attendance,
  });
});

router.post('/biometric/punch', requirePermission('dashboard.biometric'), async (req, res) => {
  const { recordPunch } = await import('../services/biometricService.js');
  await recordPunch({
    userId: req.body.userId || req.session.user.id,
    branchId: req.body.branchId || req.session.user.branchId,
    punchType: req.body.punchType,
    deviceId: req.body.deviceId,
    source: 'MANUAL',
    notes: req.body.notes,
  });
  req.session.flash = { type: 'success', message: 'Punch recorded.' };
  res.redirect('/dashboard/biometric');
});

router.get('/stock-inward', requirePermission('dashboard.stock_inward'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const [grns, movements] = await Promise.all([
    prisma.gRN.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      include: { po: { include: { vendor: true } }, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.stockMovement.findMany({
      where: {
        movementType: 'GRN_RECEIPT',
        createdAt: { gte: period.from, lte: period.to },
        ...(req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {}),
      },
      include: { product: true, branch: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  const billableQty = movements.filter((m) => m.product?.type === 'BILLABLE').reduce((s, m) => s + m.quantity, 0);
  const clinicalQty = movements.filter((m) => m.product?.type === 'CLINICAL').reduce((s, m) => s + m.quantity, 0);
  res.render('pages/dashboard/stock-inward.njk', {
    title: 'Stock Inward',
    activeModule: 'dashboard',
    grns,
    movements,
    billableQty,
    clinicalQty,
    period,
  });
});

export default router;

