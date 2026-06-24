import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';

import { requirePermission, branchScope } from '../middleware/rbac.js';

import { prisma } from '../lib/prisma.js';

import { setUploadCategory, upload, getPublicPath } from '../middleware/upload.js';

import { htmxRedirect } from '../lib/htmx.js';

import {

  createCustomerVisit,

  addTreatmentFeedback,

  createCustomerTest,

  getCustomerTreatmentSummary,

} from '../services/treatmentService.js';



const router = Router();

router.use(requireAuth, branchScope);



router.get('/visits/form', requirePermission('customer.treatment'), async (req, res) => {

  const [customers, consultants] = await Promise.all([

    prisma.customer.findMany({ where: req.branchFilter, take: 200 }),

    prisma.user.findMany({

      where: { role: { code: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } }, isActive: true },

      take: 30,

    }),

  ]);

  res.render('partials/forms/visit.njk', { customers, consultants });

});



router.get('/visits', requirePermission('customer.treatment'), async (req, res) => {

  const visits = await prisma.customerVisit.findMany({

    where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},

    include: { customer: true, branch: true, feedback: true },

    orderBy: { visitedAt: 'desc' },

    take: 100,

  });

  res.render('pages/customer/visits.njk', {

    title: 'Customer Visit Details',

    activeModule: 'customer',

    visits,

  });

});



router.post('/visits', requirePermission('customer.treatment'), async (req, res) => {

  await createCustomerVisit({

    customerId: req.body.customerId,

    branchId: req.body.branchId || req.session.user.branchId,

    consultantId: req.body.consultantId || req.session.user.id,

    visitType: req.body.visitType,

    sessionNo: req.body.sessionNo,

    treatmentNotes: req.body.treatmentNotes,

    createdById: req.session.user.id,

  });

  return htmxRedirect(req, res, {

    url: '/customer/treatment/visits',

    flash: { type: 'success', message: 'Visit recorded.' },

  });

});



router.get('/feedback/form', requirePermission('customer.treatment'), async (req, res) => {

  const visits = await prisma.customerVisit.findMany({

    where: { feedback: null, ...(req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {}) },

    include: { customer: true },

    take: 50,

    orderBy: { visitedAt: 'desc' },

  });

  res.render('partials/forms/feedback.njk', { visits });

});



router.get('/feedback', requirePermission('customer.treatment'), async (req, res) => {

  const feedbacks = await prisma.treatmentFeedback.findMany({

    where: req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {},

    include: { customer: true, visit: true },

    orderBy: { submittedAt: 'desc' },

    take: 100,

  });

  res.render('pages/customer/feedback.njk', {

    title: 'Treatment Feedback',

    activeModule: 'customer',

    feedbacks,

  });

});



router.post(

  '/feedback',

  requirePermission('customer.treatment'),

  setUploadCategory('documents'),

  upload.single('attachment'),

  async (req, res) => {

    await addTreatmentFeedback({

      visitId: req.body.visitId,

      customerId: req.body.customerId,

      rating: req.body.rating,

      feedback: req.body.feedback,

      filePath: req.file ? getPublicPath(req.file.filename, 'documents') : null,

      createdById: req.session.user.id,

    });

    return htmxRedirect(req, res, {

      url: '/customer/treatment/feedback',

      flash: { type: 'success', message: 'Feedback saved.' },

    });

  }

);



router.get('/tests/form', requirePermission('customer.treatment'), async (req, res) => {

  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 200 });

  res.render('partials/forms/test.njk', { customers });

});



router.get('/tests', requirePermission('customer.treatment'), async (req, res) => {

  const type = req.query.type || 'ALL';

  const tests = await prisma.customerTest.findMany({

    where: {

      ...(type !== 'ALL' ? { type } : {}),

      ...(req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {}),

    },

    include: { customer: true },

    orderBy: { testedAt: 'desc' },

    take: 100,

  });

  res.render('pages/customer/tests.njk', {

    title: 'HMA / DSA Tests',

    activeModule: 'customer',

    tests,

    selectedType: type,

  });

});



router.post('/tests', requirePermission('customer.treatment'), async (req, res) => {

  await createCustomerTest({

    customerId: req.body.customerId,

    type: req.body.type,

    testData: { score: req.body.score, grade: req.body.grade },

    findings: req.body.findings,

    recommendations: req.body.recommendations,

    performedById: req.session.user.id,

  });

  return htmxRedirect(req, res, {

    url: `/customer/treatment/tests?type=${req.body.type}`,

    flash: { type: 'success', message: `${req.body.type} test recorded.` },

  });

});



router.get('/:customerId', requirePermission('customer.treatment'), async (req, res) => {

  const customer = await prisma.customer.findUnique({

    where: { id: req.params.customerId },

    include: { branch: true },

  });

  if (!customer) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Customer not found' });

  const summary = await getCustomerTreatmentSummary(customer.id);

  res.render('pages/customer/treatment-profile.njk', {

    title: `Treatment — ${customer.firstName}`,

    activeModule: 'customer',

    customer,

    ...summary,

  });

});



export default router;

