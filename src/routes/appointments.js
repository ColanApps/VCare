import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { generateNumber, paginate, buildPagination } from '../utils/helpers.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';
import { sendNotification } from '../utils/audit.js';
import { onAppointmentBooked } from '../services/workflowOrchestrationService.js';
import { getActiveTreatmentSlip, attachProcedureToSlip } from '../services/treatmentPlanService.js';
import {
  startProcedure,
  completeProcedureClinical,
} from '../services/clinicalWorkflowService.js';
import { upload, setUploadCategory, getPublicPath } from '../middleware/upload.js';
import { startOfDay, endOfDay, addDays } from 'date-fns';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/', requirePermission('appointments.view'), async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      ...req.branchFilter,
      scheduledAt: { gte: startOfDay(date), lte: endOfDay(date) },
    },
    include: { customer: true, consultant: true, branch: true },
    orderBy: { scheduledAt: 'asc' },
  });
  res.render('pages/appointments/index.njk', {
    title: 'Appointment Scheduling',
    activeModule: 'appointments',
    appointments,
    selectedDate: date,
  });
});

router.get('/create', requirePermission('appointments.create'), async (req, res) => {
  const [customers, consultants, branches, treatments] = await Promise.all([
    prisma.customer.findMany({ where: req.branchFilter, take: 100, orderBy: { firstName: 'asc' } }),
    prisma.user.findMany({ where: { role: { code: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } } } }),
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.treatment.findMany({ where: { isActive: true } }),
  ]);
  const data = {
    customers,
    consultants,
    branches,
    treatments,
    preselectedCustomer: req.query.customerId,
    user: req.session.user,
  };
  if (isHtmx(req)) return res.render('partials/forms/appointment-create.njk', data);

  const date = new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      ...req.branchFilter,
      scheduledAt: { gte: startOfDay(date), lte: endOfDay(date) },
    },
    include: { customer: true, consultant: true, branch: true },
    orderBy: { scheduledAt: 'asc' },
  });
  return res.render('pages/appointments/index.njk', {
    title: 'Appointment Scheduling',
    activeModule: 'appointments',
    appointments,
    selectedDate: date,
    autoOpenModal: { title: 'Book Appointment', size: 'xl', url: '/appointments/create' },
  });
});

router.post('/create', requirePermission('appointments.create'), async (req, res) => {
  const appointmentNo = await generateNumber('APT', 'appointment', 'appointmentNo');
  const branchId = req.body.branchId || req.session.user.branchId;

  const appointment = await prisma.appointment.create({
    data: {
      appointmentNo,
      customerId: req.body.customerId,
      consultantId: req.body.consultantId || null,
      branchId,
      treatmentId: req.body.treatmentId || null,
      type: req.body.type || 'CONSULTATION',
      category: req.body.category || 'HAIR',
      scheduledAt: new Date(req.body.scheduledAt),
      duration: parseInt(req.body.duration, 10) || 30,
      status: 'SCHEDULED',
      leadSource: req.body.leadSource,
      campaign: req.body.campaign,
      notes: req.body.notes,
      source: req.body.source || 'WALK_IN',
    },
    include: { customer: true },
  });

  await onAppointmentBooked({
    appointment,
    customer: appointment.customer,
    bookedById: req.session.user.id,
    source: req.body.source || 'WALK_IN',
  });

  if (appointment.customer.email) {
    await sendNotification({
      type: 'EMAIL',
      recipient: appointment.customer.email,
      subject: `Appointment Confirmed - ${appointmentNo}`,
      message: `Your appointment is scheduled for ${new Date(req.body.scheduledAt).toLocaleString('en-IN')}.`,
      module: 'APPOINTMENTS',
      entityId: appointment.id,
    });
  }
  if (appointment.customer.phone) {
    await sendNotification({
      type: 'SMS',
      recipient: appointment.customer.phone,
      message: `VCare: Appointment ${appointmentNo} confirmed for ${new Date(req.body.scheduledAt).toLocaleDateString('en-IN')}.`,
      module: 'APPOINTMENTS',
      entityId: appointment.id,
    });
  }

  return htmxRedirect(req, res, {
    url: '/appointments',
    flash: { type: 'success', message: `Appointment ${appointmentNo} created.` },
  });
});

router.get('/search', requirePermission('appointments.view'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page);
  const where = {
    ...req.branchFilter,
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.q
      ? {
          OR: [
            { appointmentNo: { contains: req.query.q } },
            { customer: { firstName: { contains: req.query.q } } },
            { customer: { phone: { contains: req.query.q } } },
          ],
        }
      : {}),
  };

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: { customer: true, consultant: true, branch: true },
      orderBy: { scheduledAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ]);

  res.render('pages/appointments/search.njk', {
    title: 'Search Appointments',
    activeModule: 'appointments',
    appointments,
    pagination: buildPagination(total, page, limit),
    filters: req.query,
  });
});

router.get('/procedures', requirePermission('appointments.procedures'), async (req, res) => {
  const start = req.query.start ? new Date(req.query.start) : startOfDay(new Date());
  const end = addDays(start, 7);
  const procedures = await prisma.procedure.findMany({
    where: { scheduledAt: { gte: start, lte: end } },
    include: { customer: true },
    orderBy: { scheduledAt: 'asc' },
  });
  res.render('pages/appointments/procedures.njk', {
    title: 'Procedure Calendar',
    activeModule: 'appointments',
    procedures,
    weekStart: start,
  });
});

router.get('/procedures/book', requirePermission('appointments.procedures'), async (req, res) => {
  const [customers, treatments, performers] = await Promise.all([
    prisma.customer.findMany({ where: req.branchFilter, take: 100 }),
    prisma.treatment.findMany({ where: { isActive: true } }),
    prisma.user.findMany({ where: { role: { code: { in: ['THERAPIST', 'CONSULTANT', 'BRANCH_MANAGER'] } }, isActive: true }, orderBy: { firstName: 'asc' } }),
  ]);
  res.render('pages/appointments/procedure-book.njk', {
    title: 'Procedure Booking',
    activeModule: 'appointments',
    customers,
    treatments,
    performers,
    preselectedCustomer: req.query.customerId,
  });
});

router.post('/procedures/book', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    const { bookProcedureFromWorkflow } = await import('../services/clinicalWorkflowService.js');
    const { procedure } = await bookProcedureFromWorkflow({
      customerId: req.body.customerId,
      treatmentId: req.body.treatmentId || null,
      scheduledAt: req.body.scheduledAt,
      performerId: req.body.performerId || req.session.user.id,
      userId: req.session.user.id,
    });

    const sessionLabel = procedure.sessionNo ? ` (session ${procedure.sessionNo})` : '';
    req.session.flash = { type: 'success', message: `Procedure ${procedure.procedureNo} booked${sessionLabel}.` };
    res.redirect(`/appointments/procedures/${procedure.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(req.headers.referer || '/appointments/procedures/book');
  }
});

router.get('/procedures/:id', requirePermission('appointments.procedures'), async (req, res) => {
  const { getProcedureReadiness } = await import('../services/clinicalWorkflowService.js');
  const procedure = await prisma.procedure.findUnique({
    where: { id: req.params.id },
    include: { customer: true, treatment: true, treatmentSlip: true },
  });
  if (!procedure) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Procedure not found' });

  const [photos, readiness] = await Promise.all([
    prisma.customerPhoto.findMany({
      where: { customerId: procedure.customerId, type: { in: ['PROCEDURE_PRE', 'PROCEDURE_POST', 'PROCEDURE_POST_HT'] } },
      orderBy: { takenAt: 'desc' },
    }),
    getProcedureReadiness(procedure.id),
  ]);

  res.render('pages/appointments/procedure-detail.njk', {
    title: `Procedure ${procedure.procedureNo}`,
    activeModule: 'appointments',
    procedure,
    photos,
    readiness,
    workflowUrl: `/clinical/workflow/${procedure.customerId}`,
  });
});

router.post('/procedures/:id/consent', requirePermission('appointments.procedures'), async (req, res) => {
  const procedure = await prisma.procedure.update({
    where: { id: req.params.id },
    data: { consentGiven: true },
  });
  req.session.flash = {
    type: 'success',
    message: procedure.status === 'BOOKED'
      ? 'Consent recorded. You may start the procedure.'
      : 'Consent recorded.',
  };
  res.redirect(`/appointments/procedures/${req.params.id}`);
});

router.get('/procedures/:id/consent-pdf', requirePermission('appointments.procedures'), async (req, res) => {
  const { ensureProcedureConsentPdf } = await import('../services/consentFormService.js');
  try {
    const result = await ensureProcedureConsentPdf(req.params.id);
    if (!result?.publicPath) {
      req.session.flash = { type: 'error', message: 'Could not generate consent PDF.' };
      return res.redirect(`/appointments/procedures/${req.params.id}`);
    }
    return res.redirect(result.publicPath);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    return res.redirect(`/appointments/procedures/${req.params.id}`);
  }
});

router.post(
  '/procedures/:id/consent-form',
  requirePermission('appointments.procedures'),
  setUploadCategory('consent-forms'),
  upload.single('consentForm'),
  async (req, res) => {
    const procedure = await prisma.procedure.update({
      where: { id: req.params.id },
      data: {
        consentGiven: true,
        consentFormPath: getPublicPath(req.file.filename, 'consent-forms'),
      },
    });
    req.session.flash = {
      type: 'success',
      message: procedure.status === 'BOOKED'
        ? 'Consent form uploaded. You may start the procedure.'
        : 'Consent form uploaded.',
    };
    res.redirect(`/appointments/procedures/${req.params.id}`);
  }
);

router.post(
  '/procedures/:id/photo',
  requirePermission('appointments.procedures'),
  setUploadCategory('photos'),
  upload.single('photo'),
  async (req, res) => {
    const procedure = await prisma.procedure.findUnique({ where: { id: req.params.id } });
    await prisma.customerPhoto.create({
      data: {
        customerId: procedure.customerId,
        type: req.body.type || 'PROCEDURE_PRE',
        filePath: getPublicPath(req.file.filename, 'photos'),
        caption: req.body.caption,
      },
    });
    req.session.flash = { type: 'success', message: 'Procedure photo uploaded.' };
    res.redirect(`/appointments/procedures/${req.params.id}`);
  }
);

router.post('/procedures/:id/start', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    await startProcedure(req.params.id, req.session.user.id);
    req.session.flash = { type: 'success', message: 'Procedure started.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/appointments/procedures/${req.params.id}`);
});

router.post('/procedures/:id/complete', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    const { billUrl } = await completeProcedureClinical(
      req.params.id,
      req.session.user.id,
      { notes: req.body.notes },
    );
    req.session.flash = { type: 'success', message: 'Procedure completed. Create bill to finalize.' };
    if (req.body.redirectToBill === 'on') {
      return res.redirect(billUrl);
    }
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/appointments/procedures/${req.params.id}`);
});

router.get('/follow-ups/form', requirePermission('appointments.followup'), async (req, res) => {
  const [customers, staff] = await Promise.all([
    prisma.customer.findMany({ where: req.branchFilter, take: 200 }),
    prisma.user.findMany({ where: { isActive: true }, take: 50 }),
  ]);
  res.render('partials/forms/follow-up.njk', { customers, staff });
});

router.get('/follow-ups', requirePermission('appointments.followup'), async (req, res) => {
  const followUps = await prisma.followUp.findMany({
    where: req.branchFilter.branchId ? { customer: { branchId: req.branchFilter.branchId } } : {},
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.render('pages/appointments/follow-ups.njk', {
    title: 'Customer Follow Ups',
    activeModule: 'appointments',
    followUps,
  });
});

router.post('/follow-ups', requirePermission('appointments.followup'), async (req, res) => {
  await prisma.followUp.create({
    data: {
      customerId: req.body.customerId,
      type: req.body.type,
      status: 'PENDING',
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
      feedback: req.body.feedback,
      assignedTo: req.body.assignedTo || req.session.user.id,
    },
  });
  return htmxRedirect(req, res, {
    url: '/appointments/follow-ups',
    flash: { type: 'success', message: 'Follow-up created.' },
  });
});

router.post('/follow-ups/:id/complete', requirePermission('appointments.followup'), async (req, res) => {
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
  res.redirect('/appointments/follow-ups');
});

router.post('/procedures/:id/cancel', requirePermission('appointments.procedures'), async (req, res) => {
  await prisma.procedure.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED', notes: req.body.notes },
  });
  req.session.flash = { type: 'success', message: 'Procedure cancelled.' };
  res.redirect('/appointments/procedures');
});

router.get('/:id', requirePermission('appointments.view'), async (req, res) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, ...req.branchFilter },
    include: {
      customer: true,
      consultant: true,
      branch: true,
    },
  });
  if (!appointment) {
    return res.status(404).render('pages/error.njk', {
      title: 'Not Found',
      code: 404,
      message: 'Appointment not found',
    });
  }
  res.render('pages/appointments/detail.njk', {
    title: `Appointment ${appointment.appointmentNo}`,
    activeModule: 'appointments',
    appointment,
  });
});

router.post('/:id/status', requirePermission('appointments.create'), async (req, res) => {
  await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: req.body.status },
  });
  req.session.flash = { type: 'success', message: 'Appointment status updated.' };
  res.redirect(`/appointments/${req.params.id}`);
});

export default router;
