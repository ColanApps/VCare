import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';

import { requirePermission } from '../middleware/rbac.js';

import { prisma } from '../lib/prisma.js';

import { getCorporateDashboard, getAccountsDashboard, getConsultantDashboard } from '../services/portalService.js';



const router = Router();

router.use(requireAuth);



router.get('/corporate', requirePermission('portal.corporate'), async (req, res) => {

  const data = await getCorporateDashboard();

  res.render('pages/portal/corporate.njk', {

    title: 'Corporate Portal',

    activeModule: 'portal',

    layout: 'layouts/portal.njk',

    portalType: 'corporate',

    ...data,

  });

});



router.post('/corporate/tickets', requirePermission('portal.corporate'), async (req, res) => {

  await prisma.ticket.create({

    data: {

      title: req.body.subject,

      description: req.body.description,

      priority: req.body.priority || 'MEDIUM',

      status: 'OPEN',

      createdById: req.session.user.id,

      branchId: req.session.user.branchId,

    },

  });

  req.session.flash = { type: 'success', message: 'Support ticket raised.' };

  res.redirect('/portal/corporate');

});



router.get('/accounts', requirePermission('portal.accounts'), async (req, res) => {

  const data = await getAccountsDashboard();

  const outstandingBillList = await prisma.bill.findMany({

    where: { balanceAmount: { gt: 0 }, status: { in: ['PENDING', 'PARTIAL'] } },

    include: { customer: true, branch: true },

    orderBy: { billDate: 'desc' },

    take: 30,

  });

  res.render('pages/portal/accounts.njk', {

    title: 'Accounts Portal',

    activeModule: 'portal',

    layout: 'layouts/portal.njk',

    portalType: 'accounts',

    outstandingBillList,

    ...data,

  });

});



router.post('/accounts/collect', requirePermission('portal.accounts'), async (req, res) => {
  const bill = await prisma.bill.findUnique({ where: { id: req.body.billId } });
  if (!bill) {
    req.session.flash = { type: 'error', message: 'Bill not found.' };
    return res.redirect('/portal/accounts');
  }

  const amount = parseFloat(req.body.amount);
  const { recordPayment } = await import('../services/paymentService.js');
  await recordPayment({
    billId: bill.id,
    amount,
    paymentMode: req.body.paymentMode,
    referenceNo: req.body.referenceNo,
    userId: req.session.user.id,
  });

  req.session.flash = { type: 'success', message: `Payment of ₹${amount} recorded on ${bill.billNo}.` };
  res.redirect('/portal/accounts');
});

router.get('/consultant', requirePermission('portal.consultant'), async (req, res) => {
  const data = await getConsultantDashboard(req.session.user.id);
  res.render('pages/portal/consultant.njk', {
    title: 'Consultant Portal',
    activeModule: 'portal',
    layout: 'layouts/portal.njk',
    portalType: 'consultant',
    ...data,
  });
});

router.get('/branch-manager', requirePermission('portal.view'), async (req, res) => {
  const monthSales = await prisma.bill.aggregate({
    where: { billDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: { notIn: ['CANCELLED'] } },
    _sum: { totalAmount: true },
  });
  const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
  const tickets = await prisma.ticket.count({ where: { status: 'OPEN' } });
  res.render('pages/portal/branch-manager.njk', {
    title: 'Branch Manager Portal',
    activeModule: 'portal',
    layout: 'layouts/portal.njk',
    portalType: 'branch-manager',
    monthSales: monthSales._sum.totalAmount || 0,
    branches,
    openTickets: tickets,
  });
});

router.get('/warehouse', requirePermission('portal.view'), async (req, res) => {
  const stockCount = await prisma.stock.count();
  const pendingIndents = await prisma.indent.count({ where: { status: 'PENDING' } });
  const stock = await prisma.stock.findMany({ include: { product: true }, take: 20, orderBy: { quantity: 'desc' } });
  res.render('pages/portal/warehouse-portal.njk', {
    title: 'Warehouse Portal',
    activeModule: 'portal',
    layout: 'layouts/portal.njk',
    portalType: 'warehouse',
    stockCount,
    pendingIndents,
    stock,
  });
});

export default router;

