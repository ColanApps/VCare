import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import {
  getClinicalWorkflow,
  runConsultStep,
  bookProcedureFromWorkflow,
  startProcedure,
  applyProcedureConsumption,
  completeProcedureClinical,
} from '../services/clinicalWorkflowService.js';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/workflow/:customerId', requirePermission('customer.view'), async (req, res) => {
  const workflow = await getClinicalWorkflow(req.params.customerId);
  if (!workflow) {
    return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'Customer not found.' });
  }
  res.render('pages/clinical/workflow.njk', {
    title: `Clinical Workflow — ${workflow.customer.firstName}`,
    activeModule: 'customer',
    workflow,
  });
});

router.post('/workflow/:customerId/consult', requirePermission('customer.consult'), async (req, res) => {
  try {
    await runConsultStep({
      customerId: req.params.customerId,
      consultantId: req.body.consultantId || req.session.user.id,
      chiefComplaint: req.body.chiefComplaint,
      diagnosis: req.body.diagnosis,
      notes: req.body.notes,
      recommendations: req.body.recommendations,
      type: req.body.type,
    });
    req.session.flash = { type: 'success', message: 'Consultation recorded. Proceed to procedure.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/clinical/workflow/${req.params.customerId}`);
});

router.post('/workflow/:customerId/book-procedure', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    const { procedure } = await bookProcedureFromWorkflow({
      customerId: req.params.customerId,
      treatmentId: req.body.treatmentId,
      scheduledAt: req.body.scheduledAt,
      appointmentId: req.body.appointmentId || null,
      performerId: req.body.performerId || req.session.user.id,
      userId: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: `Procedure ${procedure.procedureNo} booked.` };
    return res.redirect(`/appointments/procedures/${procedure.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    return res.redirect(`/clinical/workflow/${req.params.customerId}`);
  }
});

router.post('/procedure/:id/start', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    await startProcedure(req.params.id, req.session.user.id);
    req.session.flash = { type: 'success', message: 'Procedure started.' };
    return res.redirect(`/appointments/procedures/${req.params.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    return res.redirect(req.headers.referer || `/appointments/procedures/${req.params.id}`);
  }
});

router.post('/procedure/:id/apply-consumption', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    const result = await applyProcedureConsumption(
      req.params.id,
      req.session.user.id,
      req.body.branchId || req.session.user.branchId,
    );
    const msg = result.alreadyApplied
      ? 'Consumption already applied.'
      : `Applied ${result.consumptions?.length || 0} consumption line(s).`;
    req.session.flash = { type: 'success', message: msg };
    return res.redirect(`/appointments/procedures/${req.params.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    return res.redirect(req.headers.referer || `/appointments/procedures/${req.params.id}`);
  }
});

router.post('/procedure/:procedureId/complete-bill', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    const result = await completeProcedureClinical(
      req.params.procedureId,
      req.session.user.id,
      { notes: req.body.notes },
    );
    if (req.session.user.roleCode === 'THERAPIST') {
      req.session.flash = {
        type: 'success',
        message: result.pharmacyBill
          ? 'Procedure completed. Pharmacy bill created — billing team will finalize service invoice.'
          : 'Procedure completed. Billing will be handled by consultant/accounts.',
      };
      return res.redirect(`/appointments/procedures/${req.params.procedureId}`);
    }
    return res.redirect(result.billUrl);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    return res.redirect(req.headers.referer || '/dashboard/my-tasks');
  }
});

export default router;
