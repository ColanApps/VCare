import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { paginate, buildPagination } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth, branchScope);

function customerBranchFilter(req) {
  return req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {};
}

const FOLLOW_UP_TYPES = {
  PENDING_ADVANCE: 'Pending Advance',
  SUPPLEMENTS: 'Supplements',
  NOT_JOINED: 'Not Joined',
  TREATMENT: 'Treatment Appointment',
  REGULAR: 'Regular Appointment',
  CALLBACK: 'Call Back',
};

router.get('/', requirePermission('callcenter.view'), async (req, res) => {
  const branchWhere = customerBranchFilter(req);
  const stats = await Promise.all([
    prisma.followUp.count({ where: { ...branchWhere, status: 'PENDING', type: 'PENDING_ADVANCE' } }),
    prisma.followUp.count({ where: { ...branchWhere, status: 'PENDING', type: 'NOT_JOINED' } }),
    prisma.followUp.count({ where: { ...branchWhere, status: 'PENDING', type: 'SUPPLEMENTS' } }),
    prisma.followUp.count({ where: { ...branchWhere, status: 'PENDING' } }),
  ]);

  res.render('pages/call-center/index.njk', {
    title: 'Local Call Center',
    activeModule: 'callcenter',
    stats: {
      pendingAdvance: stats[0],
      notJoined: stats[1],
      supplements: stats[2],
      total: stats[3],
    },
    followUpTypes: FOLLOW_UP_TYPES,
  });
});

router.get('/follow-ups', requirePermission('callcenter.followup'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page);
  const where = {
    ...customerBranchFilter(req),
    ...(req.query.type ? { type: req.query.type } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.q
      ? {
          customer: {
            OR: [
              { firstName: { contains: req.query.q } },
              { lastName: { contains: req.query.q } },
              { phone: { contains: req.query.q } },
              { uhid: { contains: req.query.q } },
            ],
          },
        }
      : {}),
  };

  const [followUps, total] = await Promise.all([
    prisma.followUp.findMany({
      where,
      include: { customer: { include: { branch: true } } },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.followUp.count({ where }),
  ]);

  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 100 });
  res.render('pages/call-center/follow-ups.njk', {
    title: 'Customer Follow-Up Search',
    activeModule: 'callcenter',
    followUps,
    customers,
    pagination: buildPagination(total, page, limit),
    filters: req.query,
    followUpTypes: FOLLOW_UP_TYPES,
  });
});

router.get('/callbacks', requirePermission('callcenter.followup'), async (req, res) => {
  const callbacks = await prisma.followUp.findMany({
    where: {
      ...customerBranchFilter(req),
      type: 'CALLBACK',
      status: 'PENDING',
      scheduledAt: { gte: new Date() },
    },
    include: { customer: true },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  });
  res.render('pages/call-center/callbacks.njk', {
    title: 'Next Follow-Up (Call Back)',
    activeModule: 'callcenter',
    callbacks,
  });
});

router.get('/not-joined', requirePermission('callcenter.followup'), async (req, res) => {
  const [followUps, customers] = await Promise.all([
    prisma.followUp.findMany({
      where: { ...customerBranchFilter(req), type: 'NOT_JOINED' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.customer.findMany({
      where: {
        ...req.branchFilter,
        bills: { none: {} },
        registeredAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      include: { branch: true },
      take: 30,
    }),
  ]);
  res.render('pages/call-center/not-joined.njk', {
    title: 'Not Joined Follow-Up',
    activeModule: 'callcenter',
    followUps,
    prospects: customers,
  });
});

router.post('/follow-ups', requirePermission('callcenter.followup'), async (req, res) => {
  await prisma.followUp.create({
    data: {
      customerId: req.body.customerId,
      type: req.body.type,
      status: 'PENDING',
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
      feedback: req.body.feedback,
      assignedTo: req.session.user.id,
      nextFollowUp: req.body.nextFollowUp ? new Date(req.body.nextFollowUp) : null,
    },
  });
  req.session.flash = { type: 'success', message: 'Follow-up scheduled.' };
  res.redirect(req.body.redirect || '/call-center/follow-ups');
});

router.post('/follow-ups/:id/complete', requirePermission('callcenter.followup'), async (req, res) => {
  const { onFollowUpCompleted } = await import('../services/workflowOrchestrationService.js');
  const fu = await onFollowUpCompleted({
    followUpId: req.params.id,
    feedback: req.body.feedback,
    userId: req.session.user.id,
  });
  if (req.body.nextFollowUp) {
    await prisma.followUp.create({
      data: {
        customerId: fu.customerId,
        type: 'CALLBACK',
        status: 'PENDING',
        scheduledAt: new Date(req.body.nextFollowUp),
        assignedTo: req.session.user.id,
      },
    });
  }
  req.session.flash = { type: 'success', message: 'Follow-up completed.' };
  res.redirect(req.headers.referer || '/call-center/follow-ups');
});

router.get('/treatment-booked', requirePermission('callcenter.view'), async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: {
      ...req.branchFilter,
      type: 'TREATMENT',
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    include: { customer: true, consultant: true, branch: true },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  });
  res.render('pages/call-center/treatment-booked.njk', {
    title: 'Treatment Booked',
    activeModule: 'callcenter',
    appointments,
  });
});

router.get('/treatment-calendar', requirePermission('callcenter.view'), async (req, res) => {
  const base = new Date(req.query.date || Date.now());
  const dayStart = new Date(base);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(base);
  dayEnd.setHours(23, 59, 59, 999);
  const appointments = await prisma.appointment.findMany({
    where: {
      ...req.branchFilter,
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    include: { customer: true, consultant: true, branch: true },
    orderBy: { scheduledAt: 'asc' },
  });
  res.render('pages/call-center/treatment-calendar.njk', {
    title: 'Treatment Calendar',
    activeModule: 'callcenter',
    appointments,
    selectedDate: dayStart.toISOString().split('T')[0],
  });
});

router.get('/pending-session', requirePermission('callcenter.followup'), async (req, res) => {
  const visits = await prisma.customerVisit.findMany({
    where: {
      ...(req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {}),
      status: 'COMPLETED',
    },
    include: { customer: true, branch: true },
    orderBy: { visitedAt: 'desc' },
    take: 50,
  });
  const followUps = await prisma.followUp.findMany({
    where: { ...customerBranchFilter(req), type: 'TREATMENT', status: 'PENDING' },
    include: { customer: true },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  });
  res.render('pages/call-center/pending-session.njk', {
    title: 'Pending Session Follow-Up',
    activeModule: 'callcenter',
    visits,
    followUps,
    followUpTypes: FOLLOW_UP_TYPES,
  });
});

router.get('/supplements', requirePermission('callcenter.followup'), async (req, res) => {
  const followUps = await prisma.followUp.findMany({
    where: { ...customerBranchFilter(req), type: 'SUPPLEMENTS' },
    include: { customer: { include: { branch: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 100 });
  res.render('pages/call-center/supplements.njk', {
    title: 'Supplements Follow-Up',
    activeModule: 'callcenter',
    followUps,
    customers,
    followUpTypes: FOLLOW_UP_TYPES,
  });
});

router.get('/dialer', requirePermission('callcenter.view'), async (req, res) => {
  const { getDialerDashboard, getAvailableSlots } = await import('../services/callCenterBookingService.js');
  const [dashboard, branches, consultants] = await Promise.all([
    getDialerDashboard(req.branchFilter),
    prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } }),
    prisma.user.findMany({ where: { role: { code: 'CONSULTANT' }, isActive: true }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const branchId = req.query.branchId || req.session.user.branchId || branches[0]?.id;
  const slots = branchId ? await getAvailableSlots({ branchId, date: req.query.date, consultantId: req.query.consultantId }) : [];
  res.render('pages/call-center/dialer.njk', {
    title: 'Dialer',
    activeModule: 'callcenter',
    dashboard,
    branches,
    consultants,
    branchId,
    slots,
    filters: req.query,
  });
});

router.post('/dialer/lookup', requirePermission('callcenter.view'), async (req, res) => {
  const { lookupCustomerByPhone } = await import('../services/callCenterBookingService.js');
  const customer = await lookupCustomerByPhone(req.body.phone, req.branchFilter);
  res.json({ found: Boolean(customer), customer });
});

router.get('/follow-ups/next-sitting', requirePermission('callcenter.followup'), async (req, res) => {
  const where = {
    ...customerBranchFilter(req),
    type: 'TREATMENT',
    status: 'PENDING',
    ...(req.query.customerId ? { customerId: req.query.customerId } : {}),
  };
  const followUps = await prisma.followUp.findMany({
    where,
    include: {
      customer: {
        include: {
          treatmentSlips: { where: { status: 'ACTIVE' }, take: 1, orderBy: { createdAt: 'desc' } },
        },
      },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  });
  res.render('pages/call-center/next-sitting.njk', {
    title: 'Next Sitting Follow-Ups',
    activeModule: 'callcenter',
    followUps,
  });
});

router.post('/dialer/book', requirePermission('callcenter.view'), async (req, res) => {
  try {
    const { bookDialerAppointment } = await import('../services/callCenterBookingService.js');
    const result = await bookDialerAppointment({
      customerPhone: req.body.phone,
      customerName: req.body.customerName,
      email: req.body.email,
      branchId: req.body.branchId,
      consultantId: req.body.consultantId,
      scheduledAt: req.body.scheduledAt,
      category: req.body.category,
      leadSource: req.body.leadSource || 'DIALER',
      campaign: req.body.campaign,
      bookedById: req.session.user.id,
      createFollowUp: req.body.createFollowUp === 'on',
    });
    req.session.flash = { type: 'success', message: `Booked ${result.appointment.appointmentNo} for ${result.customer.firstName}. Consultant will see this in My Tasks.` };
    res.redirect(`/clinical/workflow/${result.customer.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/call-center/dialer');
  }
});

export default router;
