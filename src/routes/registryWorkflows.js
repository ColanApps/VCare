import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { htmxRedirect } from '../lib/htmx.js';
import { processIncentiveUpload } from '../services/incentiveWorkflowService.js';
import { generateNumber } from '../utils/helpers.js';
import { upload, setUploadCategory, getPublicPath } from '../middleware/upload.js';
import fs from 'fs';

const router = Router();
router.use(requireAuth);

// ─── Stock / purchase / sales ────────────────────────────────────────────────

router.post('/registry/actions/stock-outward/:id/authorize', requirePermission('inventory.outward'), async (req, res) => {
  try {
    const { authorizeStockOutward } = await import('../services/stockOutwardService.js');
    await authorizeStockOutward({ outwardId: req.params.id, authorizedById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Stock outward authorized.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(req.headers.referer || '/inventory/warehouse/outward/authorize');
});

router.post('/registry/actions/work-order/:id/authorize', requirePermission('purchase.workorder'), async (req, res) => {
  try {
    const { authorizeWorkOrder } = await import('../services/workOrderService.js');
    await authorizeWorkOrder({ workOrderId: req.params.id, action: 'approve', authorizedById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Work order authorized.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/work-orders/authorize');
});

router.post('/registry/actions/po/:id/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status: 'APPROVED' } });
  req.session.flash = { type: 'success', message: 'PO approved.' };
  res.redirect('/dashboard/po-authorization');
});

router.post('/registry/actions/loan/:id/approve', requirePermission('billing.loans'), async (req, res) => {
  await prisma.loanAccount.update({ where: { id: req.params.id }, data: { status: 'APPROVED' } });
  req.session.flash = { type: 'success', message: 'Loan approved.' };
  res.redirect('/billing/loans/estimate');
});

router.post('/registry/actions/challan/:id/cancel', requirePermission('sales.view'), async (req, res) => {
  await prisma.deliveryChallan.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
  req.session.flash = { type: 'success', message: 'Challan cancelled.' };
  res.redirect('/sales/challans');
});

router.post('/registry/actions/transfer/:id/approve', requirePermission('inventory.transfer'), async (req, res) => {
  try {
    const { approveStockTransfer } = await import('../services/stockService.js');
    await approveStockTransfer(req.params.id, req.session.user.id);
    req.session.flash = { type: 'success', message: 'Transfer approved.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/stock-transfers');
});

router.post('/registry/actions/indent/:id/fulfill', requirePermission('inventory.authorize'), async (req, res) => {
  try {
    const { fulfillIndent } = await import('../services/stockService.js');
    await fulfillIndent({ indentId: req.params.id, createdById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Indent fulfilled and stock transferred.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(req.headers.referer || '/inventory/indents');
});

// ─── Operations ──────────────────────────────────────────────────────────────

router.post('/registry/actions/iou/:id/settle', requirePermission('operations.iou'), async (req, res) => {
  await prisma.iOURequest.update({ where: { id: req.params.id }, data: { status: 'SETTLED', settledAt: new Date() } });
  req.session.flash = { type: 'success', message: 'IOU settled.' };
  res.redirect('/operations/iou/settlement');
});

router.post('/registry/actions/iou/:id/approve', requirePermission('operations.iou'), async (req, res) => {
  const status = req.body.action === 'reject' ? 'REJECTED' : 'APPROVED';
  await prisma.iOURequest.update({
    where: { id: req.params.id },
    data: {
      status,
      approvedById: req.session.user.id,
      approvedAt: status === 'APPROVED' ? new Date() : null,
    },
  });
  req.session.flash = { type: 'success', message: `IOU ${status.toLowerCase()}.` };
  res.redirect('/operations/iou/approve');
});

router.post('/registry/actions/petty/:id/approve', requirePermission('operations.petty'), async (req, res) => {
  const status = req.body.action === 'reject' ? 'REJECTED' : 'APPROVED';
  await prisma.pettyCash.update({ where: { id: req.params.id }, data: { status } });
  req.session.flash = { type: 'success', message: `Petty cash ${status.toLowerCase()}.` };
  res.redirect('/operations/petty-cash/approve');
});

router.post('/registry/actions/reimbursement/:id/approve', requirePermission('operations.iou'), async (req, res) => {
  const status = req.body.action === 'reject' ? 'REJECTED' : 'APPROVED';
  await prisma.reimbursementClaim.update({ where: { id: req.params.id }, data: { status } });
  req.session.flash = { type: 'success', message: `Reimbursement ${status.toLowerCase()}.` };
  res.redirect('/operations/iou/reimbursement/approve');
});

router.post('/registry/actions/ticket/:id/close', requirePermission('operations.tickets'), async (req, res) => {
  await prisma.ticket.update({ where: { id: req.params.id }, data: { status: 'CLOSED' } });
  req.session.flash = { type: 'success', message: 'Ticket closed.' };
  res.redirect(req.headers.referer || '/operations/tickets');
});

// ─── Clinical ────────────────────────────────────────────────────────────────

router.post('/registry/actions/procedure/:id/start', requirePermission('appointments.procedures'), async (req, res) => {
  try {
    const { startProcedureClinical } = await import('../services/clinicalProcedureService.js');
    await startProcedureClinical(req.params.id, req.session.user.id);
    req.session.flash = { type: 'success', message: 'Procedure started.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect(`/appointments/procedures/${req.params.id}`);
});

router.post('/registry/actions/followup/:id/complete', requirePermission('appointments.followup'), async (req, res) => {
  const { onFollowUpCompleted } = await import('../services/workflowOrchestrationService.js');
  await onFollowUpCompleted({ followUpId: req.params.id, feedback: req.body.feedback, userId: req.session.user.id });
  req.session.flash = { type: 'success', message: 'Follow-up completed.' };
  res.redirect(req.headers.referer || '/call-center/follow-ups');
});

// ─── Incentive ───────────────────────────────────────────────────────────────

router.post('/registry/actions/incentive/:id/process', requirePermission('reports.incentives'), async (req, res) => {
  try {
    const result = await processIncentiveUpload(req.params.id);
    req.session.flash = { type: 'success', message: `Incentives calculated: ${result.procedureCount} procedures, ₹${result.totalIncentive.toFixed(0)} total.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/reports/incentives/upload');
});

router.post('/registry/actions/asset/:id/barcode', requirePermission('inventory.stock'), async (req, res) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
  if (!asset) return res.status(404).send('Not found');
  const barcode = asset.barcode || `AST-${asset.assetNo}`;
  await prisma.asset.update({ where: { id: asset.id }, data: { barcode } });
  req.session.flash = { type: 'success', message: `Barcode ${barcode} assigned.` };
  res.redirect('/inventory/assets/barcode');
});

// ─── Modal forms ─────────────────────────────────────────────────────────────

router.get('/registry/forms/product-tax/:id', requirePermission('inventory.products'), async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return res.status(404).send('Product not found');
  res.render('partials/forms/product-tax-edit.njk', { product });
});

router.post('/registry/forms/product-tax/:id', requirePermission('inventory.products'), async (req, res) => {
  await prisma.product.update({
    where: { id: req.params.id },
    data: { taxRate: parseFloat(req.body.taxRate), hsnCode: req.body.hsnCode },
  });
  return htmxRedirect(req, res, { url: '/inventory/masters/product-tax', flash: { type: 'success', message: 'Tax updated.' } });
});

router.get('/registry/forms/kit/:id', requirePermission('inventory.products'), async (req, res) => {
  const kit = await prisma.kitMapping.findFirst({ where: { kitCode: req.params.id } })
    || await prisma.kitMapping.findUnique({ where: { id: req.params.id } });
  if (!kit) return res.status(404).send('Kit not found');
  res.render('partials/forms/kit-edit.njk', { kit });
});

router.post('/registry/forms/kit/:id', requirePermission('inventory.products'), async (req, res) => {
  const kit = await prisma.kitMapping.findFirst({ where: { OR: [{ id: req.params.id }, { kitCode: req.params.id }] } });
  if (!kit) return res.status(404).send('Not found');
  await prisma.kitMapping.update({
    where: { id: kit.id },
    data: { name: req.body.name, mapType: req.body.mapType, itemsJson: req.body.itemsJson },
  });
  return htmxRedirect(req, res, { url: req.body.returnPath || '/inventory/masters/advance-kit', flash: { type: 'success', message: 'Kit updated.' } });
});

router.get('/registry/forms/clinical/:id', requirePermission('inventory.clinical'), async (req, res) => {
  const treatment = await prisma.clinicalTreatment.findFirst({
    where: { OR: [{ id: req.params.id }, { code: req.params.id }] },
  });
  if (!treatment) return res.status(404).send('Not found');
  res.render('partials/forms/clinical-edit.njk', { treatment });
});

router.post('/registry/forms/clinical/:id', requirePermission('inventory.clinical'), async (req, res) => {
  const treatment = await prisma.clinicalTreatment.findFirst({
    where: { OR: [{ id: req.params.id }, { code: req.params.id }] },
  });
  if (!treatment) return res.status(404).send('Not found');
  await prisma.clinicalTreatment.update({
    where: { id: treatment.id },
    data: { name: req.body.name, category: req.body.category, basePrice: parseFloat(req.body.basePrice) },
  });
  return htmxRedirect(req, res, { url: '/inventory/masters/services', flash: { type: 'success', message: 'Service updated.' } });
});

router.get('/registry/forms/sms', requirePermission('callcenter.followup'), async (req, res) => {
  res.render('partials/forms/send-sms.njk', { phone: req.query.phone || '' });
});

router.post('/registry/forms/sms', requirePermission('callcenter.followup'), async (req, res) => {
  await prisma.notificationLog.create({
    data: {
      type: 'SMS',
      recipient: req.body.phone,
      message: req.body.message,
      status: 'SENT',
      module: 'CALLCENTER',
    },
  });
  return htmxRedirect(req, res, { url: '/reports/call-center/sms', flash: { type: 'success', message: 'SMS logged and queued.' } });
});

router.get('/registry/forms/lead-upload', requirePermission('reports.customers'), async (req, res) => {
  res.render('partials/forms/lead-upload.njk', {});
});

router.post('/registry/forms/lead-upload', requirePermission('reports.customers'), setUploadCategory('leads'), upload.single('file'), async (req, res) => {
  const lines = [];
  if (req.file) {
    const raw = fs.readFileSync(req.file.path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || /^name/i.test(trimmed)) continue;
      lines.push(trimmed);
    }
  }
  lines.push(...(req.body.leads || '').split('\n').map((l) => l.trim()).filter(Boolean));

  let created = 0;
  for (const line of [...new Set(lines)]) {
    const [name, phone] = line.split(',').map((s) => s.trim());
    if (!phone) continue;
    const exists = await prisma.customer.findFirst({ where: { phone } });
    if (exists) continue;
    const uhid = await generateNumber('UHID', 'customer', 'uhid');
    const parts = (name || 'Lead').split(/\s+/);
    await prisma.customer.create({
      data: {
        uhid,
        firstName: parts[0],
        lastName: parts.slice(1).join(' ') || '',
        phone,
        branchId: req.session.user.branchId,
        status: 'ACTIVE',
        leadSource: 'CC_UPLOAD',
      },
    });
    created += 1;
  }
  return htmxRedirect(req, res, {
    url: '/reports/call-center/lead-upload',
    flash: { type: 'success', message: `${created} leads imported${req.file ? ' (file + text)' : ''}.` },
  });
});

// ─── Geography modals ────────────────────────────────────────────────────────

router.get('/registry/forms/geography/:level', requirePermission('master.geography'), async (req, res) => {
  const level = req.params.level;
  const [countries, states] = await Promise.all([
    prisma.country.findMany(),
    prisma.state.findMany({ include: { country: true } }),
  ]);
  const cities = await prisma.city.findMany({ include: { state: { include: { country: true } } } });
  res.render('partials/forms/geography-create.njk', { level, countries, states, cities });
});

router.get('/registry/forms/geography/:level/:id/edit', requirePermission('master.geography'), async (req, res) => {
  const { level, id } = req.params;
  const models = { country: prisma.country, state: prisma.state, city: prisma.city, area: prisma.area };
  const record = await models[level]?.findUnique({ where: { id } });
  if (!record) return res.status(404).send('Not found');
  const [countries, states] = await Promise.all([prisma.country.findMany(), prisma.state.findMany()]);
  const cities = await prisma.city.findMany({ include: { state: true } });
  res.render('partials/forms/geography-edit.njk', { level, record, countries, states, cities });
});

export default router;
