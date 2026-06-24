import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { generateNumber, paginate, buildPagination } from '../utils/helpers.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';
import { logAudit } from '../utils/audit.js';
import { upload, setUploadCategory, getPublicPath } from '../middleware/upload.js';
import {
  getPendingScheduleCustomers,
  getScheduleProgress,
  initScheduleWorkflow,
  completeScheduleStep,
  createTreatmentSlip,
  createTrichoscanTest,
  STEP_LABELS,
  SCHEDULE_STEPS,
  maybeFinalizeWorkflow,
} from '../services/schedulePendingService.js';
import { syncConsultationWithClinicalWorkflow } from '../services/clinicalWorkflowService.js';
import { onConsultationCompleted } from '../services/workflowOrchestrationService.js';
import { getTreatmentPlanProgress } from '../services/treatmentPlanService.js';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/register', requirePermission('customer.create'), async (req, res) => {
  const [branches, occupations, knownBy] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.occupation.findMany(),
    prisma.knownBy.findMany(),
  ]);
  const data = { branches, occupations, knownBy };
  if (isHtmx(req)) return res.render('partials/forms/customer-register.njk', data);

  const { page, limit, skip } = paginate(req.query.page);
  const where = { ...req.branchFilter };
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { branch: true },
      orderBy: { registeredAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);
  return res.render('pages/customer/search.njk', {
    title: 'Search Customer',
    activeModule: 'customer',
    customers,
    pagination: buildPagination(total, page, limit),
    filters: req.query,
    autoOpenModal: { title: 'Customer Registration', size: 'lg', url: '/customer/register' },
  });
});

router.post('/register', requirePermission('customer.create'), async (req, res) => {
  const uhid = await generateNumber('UHID', 'customer', 'uhid');
  const branchId = req.body.branchId || req.session.user.branchId;

  const customer = await prisma.customer.create({
    data: {
      uhid,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email || null,
      phone: req.body.phone,
      alternatePhone: req.body.alternatePhone || null,
      gender: req.body.gender || null,
      dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null,
      occupationId: req.body.occupationId || null,
      knownById: req.body.knownById || null,
      address: req.body.address || null,
      branchId,
      leadSource: req.body.leadSource || null,
      category: req.body.category || 'HAIR',
    },
  });

  const consultation = await prisma.consultation.create({
    data: {
      customerId: customer.id,
      consultantId: req.session.user.id,
      type: 'INITIAL',
      status: 'PENDING',
    },
  });

  await initScheduleWorkflow(customer.id, consultation.id);

  await logAudit({
    userId: req.session.user.id,
    action: 'CREATE',
    module: 'CUSTOMER',
    entityType: 'Customer',
    entityId: customer.id,
    ipAddress: req.ip,
  });

  return htmxRedirect(req, res, {
    url: `/customer/schedule-pending/${customer.id}`,
    flash: { type: 'success', message: `Customer registered with UHID: ${uhid}` },
  });
});

router.get('/search', requirePermission('customer.view'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page);
  const q = req.query.q?.trim();
  const where = {
    ...req.branchFilter,
    ...(q
      ? {
          OR: [
            { uhid: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
    ...(req.query.category ? { category: req.query.category } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { branch: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  res.render('pages/customer/search.njk', {
    title: 'Search Customer',
    activeModule: 'customer',
    customers,
    pagination: buildPagination(total, page, limit),
    filters: req.query,
  });
});

router.get('/schedule-pending', requirePermission('customer.schedule'), async (req, res) => {
  const customers = await getPendingScheduleCustomers(req.branchFilter);
  res.render('pages/customer/schedule-pending.njk', {
    title: 'Schedule Pending',
    activeModule: 'customer',
    customers,
    stepLabels: STEP_LABELS,
  });
});

router.get('/schedule-pending/:id', requirePermission('customer.schedule'), async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      branch: true,
      consultations: { orderBy: { createdAt: 'desc' }, take: 1 },
      photos: true,
      treatmentSlips: { orderBy: { createdAt: 'desc' }, take: 3 },
      trichoscanTests: { orderBy: { testedAt: 'desc' }, take: 3 },
    },
  });
  if (!customer) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Customer not found' });

  const consultationId = customer.consultations[0]?.id;
  const consultation = customer.consultations[0];
  const progress = await getScheduleProgress(customer.id, consultationId);
  const treatments = await prisma.treatment.findMany({ where: { isActive: true, category: customer.category } });

  const stepsStatus = {};
  for (const step of SCHEDULE_STEPS) {
    stepsStatus[step] = progress.steps.find((s) => s.step === step)?.status || 'PENDING';
  }

  const existingSlip = customer.treatmentSlips.find((s) => s.status === 'ACTIVE') || customer.treatmentSlips[0] || null;
  let treatmentPlan = null;
  if (existingSlip) {
    try {
      treatmentPlan = await getTreatmentPlanProgress(existingSlip.id);
    } catch {
      treatmentPlan = null;
    }
  }

  res.render('pages/customer/schedule-workflow.njk', {
    title: `Schedule Pending — ${customer.firstName} ${customer.lastName}`,
    activeModule: 'customer',
    customer,
    consultation,
    consultationId,
    progress,
    stepsStatus,
    stepLabels: STEP_LABELS,
    scheduleSteps: SCHEDULE_STEPS,
    treatments,
    existingSlip,
    treatmentPlan,
  });
});

router.post('/schedule-pending/:id/consultation', requirePermission('customer.consult'), async (req, res) => {
  let consultationId = req.body.consultationId;
  if (consultationId) {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: {
        chiefComplaint: req.body.chiefComplaint,
        diagnosis: req.body.diagnosis,
        notes: req.body.notes,
        recommendations: req.body.recommendations,
        type: req.body.type || 'INITIAL',
        status: 'COMPLETED',
      },
    });
  } else {
    const created = await prisma.consultation.create({
      data: {
        customerId: req.params.id,
        consultantId: req.session.user.id,
        chiefComplaint: req.body.chiefComplaint,
        diagnosis: req.body.diagnosis,
        notes: req.body.notes,
        recommendations: req.body.recommendations,
        type: req.body.type || 'INITIAL',
        status: 'COMPLETED',
      },
    });
    consultationId = created.id;
    await initScheduleWorkflow(req.params.id, consultationId);
  }
  await syncConsultationWithClinicalWorkflow(req.params.id, consultationId);
  await onConsultationCompleted({
    customerId: req.params.id,
    consultantId: req.session.user.id,
    consultationId,
  });
  await completeScheduleStep({ customerId: req.params.id, consultationId, step: 'CONSULTATION', userId: req.session.user.id });
  req.session.flash = { type: 'success', message: 'Consultation form saved.' };
  res.redirect(`/customer/schedule-pending/${req.params.id}`);
});

router.post(
  '/schedule-pending/:id/photo',
  requirePermission('customer.photos'),
  setUploadCategory('photos'),
  upload.single('photo'),
  async (req, res) => {
    const step = req.body.step || 'BEFORE_PHOTO';
    const photoType = step === 'AFTER_PHOTO' ? 'AFTER' : 'BEFORE';

    await prisma.customerPhoto.create({
      data: {
        customerId: req.params.id,
        type: photoType,
        filePath: getPublicPath(req.file.filename, 'photos'),
        caption: req.body.caption,
      },
    });

    await completeScheduleStep({
      customerId: req.params.id,
      consultationId: req.body.consultationId,
      step,
      userId: req.session.user.id,
    });

    req.session.flash = { type: 'success', message: `${photoType} photo uploaded.` };
    res.redirect(`/customer/schedule-pending/${req.params.id}`);
  }
);

router.post('/schedule-pending/:id/trichoscan', requirePermission('customer.consult'), async (req, res) => {
  await createTrichoscanTest({
    customerId: req.params.id,
    consultationId: req.body.consultationId,
    data: req.body,
    userId: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: 'Trichoscan test recorded.' };
  res.redirect(`/customer/schedule-pending/${req.params.id}`);
});

router.post('/schedule-pending/:id/treatment-slip', requirePermission('customer.consult'), async (req, res) => {
  const treatments = JSON.parse(req.body.treatments || '[]');
  const slip = await createTreatmentSlip({
    customerId: req.params.id,
    consultationId: req.body.consultationId,
    treatments,
    sessions: parseInt(req.body.sessions, 10) || 1,
    notes: req.body.notes,
    userId: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: `Treatment slip ${slip.slipNo} generated.` };
  res.redirect(`/customer/schedule-pending/${req.params.id}`);
});

router.post('/schedule-pending/:id/regular-consultation', requirePermission('customer.consult'), async (req, res) => {
  const consultationId = req.body.consultationId;
  if (consultationId) {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: {
        notes: req.body.notes,
        recommendations: req.body.recommendations,
        diagnosis: req.body.diagnosis,
        type: 'REGULAR',
      },
    });
  } else {
    await prisma.consultation.create({
      data: {
        customerId: req.params.id,
        consultantId: req.session.user.id,
        type: 'REGULAR',
        diagnosis: req.body.diagnosis,
        notes: req.body.notes,
        recommendations: req.body.recommendations,
        status: 'COMPLETED',
      },
    });
  }
  await completeScheduleStep({
    customerId: req.params.id,
    consultationId,
    step: 'REGULAR_CONSULTATION',
    userId: req.session.user.id,
    notes: req.body.notes,
  });
  await maybeFinalizeWorkflow(req.params.id, consultationId);
  req.session.flash = { type: 'success', message: 'Regular consultation saved.' };
  res.redirect(`/customer/schedule-pending/${req.params.id}`);
});

router.get('/consultations/form', requirePermission('customer.consult'), async (req, res) => {
  const [consultants, customers] = await Promise.all([
    prisma.user.findMany({
      where: { role: { code: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } } },
      take: 20,
    }),
    prisma.customer.findMany({ where: req.branchFilter, take: 200, orderBy: { firstName: 'asc' } }),
  ]);
  res.render('partials/forms/consultation.njk', { consultants, customers });
});

router.get('/consultations', requirePermission('customer.consult'), async (req, res) => {
  const consultations = await prisma.consultation.findMany({
    where: req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {},
    include: { customer: true, consultant: true },
    orderBy: { consultedAt: 'desc' },
    take: 50,
  });
  res.render('pages/customer/consultations.njk', {
    title: 'Consultations',
    activeModule: 'customer',
    consultations,
  });
});

router.post('/consultations', requirePermission('customer.consult'), async (req, res) => {
  const consultation = await prisma.consultation.create({
    data: {
      customerId: req.body.customerId,
      consultantId: req.body.consultantId || req.session.user.id,
      type: req.body.type || 'REGULAR',
      chiefComplaint: req.body.chiefComplaint,
      diagnosis: req.body.diagnosis,
      notes: req.body.notes,
      recommendations: req.body.recommendations,
      status: 'COMPLETED',
    },
  });
  await initScheduleWorkflow(req.body.customerId, consultation.id);
  return htmxRedirect(req, res, {
    url: '/customer/consultations',
    flash: { type: 'success', message: 'Consultation recorded.' },
  });
});

router.get('/photos', requirePermission('customer.photos'), async (req, res) => {
  const photos = await prisma.customerPhoto.findMany({
    where: req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {},
    include: { customer: true },
    orderBy: { takenAt: 'desc' },
    take: 50,
  });
  const customers = await prisma.customer.findMany({ where: req.branchFilter, take: 200, orderBy: { firstName: 'asc' } });
  res.render('pages/customer/photos.njk', {
    title: 'Before/After Photos',
    activeModule: 'customer',
    photos,
    customers,
  });
});

router.post(
  '/photos/upload',
  requirePermission('customer.photos'),
  setUploadCategory('photos'),
  upload.single('photo'),
  async (req, res) => {
    await prisma.customerPhoto.create({
      data: {
        customerId: req.body.customerId,
        type: req.body.type || 'BEFORE',
        filePath: getPublicPath(req.file.filename, 'photos'),
        caption: req.body.caption,
      },
    });
    req.session.flash = { type: 'success', message: 'Photo uploaded successfully.' };
    res.redirect(req.body.redirect || '/customer/photos');
  }
);

router.post('/photos/:id/delete', requirePermission('customer.photos'), async (req, res) => {
  await prisma.customerPhoto.delete({ where: { id: req.params.id } });
  req.session.flash = { type: 'success', message: 'Photo removed.' };
  res.redirect(req.headers.referer || '/customer/photos');
});

router.post('/:id/edit', requirePermission('customer.create'), async (req, res) => {
  await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email || null,
      phone: req.body.phone,
      alternatePhone: req.body.alternatePhone || null,
      gender: req.body.gender || null,
      address: req.body.address || null,
      category: req.body.category,
      status: req.body.status || 'ACTIVE',
    },
  });
  req.session.flash = { type: 'success', message: 'Customer profile updated.' };
  res.redirect(`/customer/${req.params.id}`);
});

router.get('/:id', requirePermission('customer.view'), async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      branch: true,
      appointments: { orderBy: { scheduledAt: 'desc' }, take: 10 },
      consultations: { include: { consultant: true }, orderBy: { consultedAt: 'desc' }, take: 10 },
      bills: { orderBy: { billDate: 'desc' }, take: 10 },
      photos: { orderBy: { takenAt: 'desc' } },
      procedures: { orderBy: { scheduledAt: 'desc' }, take: 5 },
      treatmentSlips: { orderBy: { createdAt: 'desc' }, take: 5 },
      trichoscanTests: { orderBy: { testedAt: 'desc' }, take: 5 },
    },
  });
  if (!customer) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Customer not found' });
  res.render('pages/customer/profile.njk', { title: `${customer.firstName} ${customer.lastName}`, activeModule: 'customer', customer });
});

export default router;
