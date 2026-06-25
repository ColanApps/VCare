import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { htmxRedirect } from '../lib/htmx.js';
import { resolveBranchId } from '../utils/branchHelpers.js';
import { upload, setUploadCategory, getPublicPath } from '../middleware/upload.js';

const router = Router();
router.use(requireAuth);

router.get('/tickets/form', requirePermission('operations.tickets'), async (req, res) => {
  const users = await prisma.user.findMany({ where: { isActive: true }, take: 30 });
  res.render('partials/forms/ticket.njk', { users });
});

router.get('/tickets', requirePermission('operations.tickets'), async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    include: { createdBy: true, assignedTo: true, branch: true },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/operations/tickets.njk', { title: 'V Support', activeModule: 'operations', tickets });
});

router.post('/tickets', requirePermission('operations.tickets'), async (req, res) => {
  try {
    const branchId = resolveBranchId({
      bodyBranchId: req.body.branchId,
      userBranchId: req.session.user.branchId,
    });
    const ticketNo = await generateNumber('TKT', 'ticket', 'ticketNo');
    await prisma.ticket.create({
      data: {
        ticketNo,
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        priority: req.body.priority || 'MEDIUM',
        branchId,
        createdById: req.session.user.id,
        assignedToId: req.body.assignedToId || null,
      },
    });
    return htmxRedirect(req, res, {
      url: '/operations/tickets',
      flash: { type: 'success', message: `Ticket ${ticketNo} created.` },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/operations/tickets',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.post('/tickets/:id/status', requirePermission('operations.tickets'), async (req, res) => {
  await prisma.ticket.update({
    where: { id: req.params.id },
    data: {
      status: req.body.status,
      resolvedAt: req.body.status === 'RESOLVED' ? new Date() : null,
    },
  });
  res.redirect('/operations/tickets');
});

router.get('/iou/form', requirePermission('operations.iou'), async (req, res) => {
  res.render('partials/forms/iou.njk', {});
});

router.get('/iou', requirePermission('operations.iou'), async (req, res) => {
  const requests = await prisma.iOURequest.findMany({
    include: { requester: true, approvedBy: true, branch: true },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/operations/iou.njk', { title: 'IOU Requests', activeModule: 'operations', requests });
});

router.get('/iou/approve', requirePermission('operations.iou'), async (req, res) => {
  const requests = await prisma.iOURequest.findMany({
    where: { status: 'PENDING' },
    include: { requester: true, branch: true },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/operations/iou.njk', {
    title: 'IOU Approval',
    activeModule: 'operations',
    requests,
    pendingOnly: true,
  });
});

router.post('/iou', requirePermission('operations.iou'), setUploadCategory('claims'), upload.single('attachment'), async (req, res) => {
  try {
    const branchId = resolveBranchId({
      bodyBranchId: req.body.branchId,
      userBranchId: req.session.user.branchId,
    });
    const requestNo = await generateNumber('IOU', 'iOURequest', 'requestNo');
    await prisma.iOURequest.create({
      data: {
        requestNo,
        requesterId: req.session.user.id,
        branchId,
        amount: parseFloat(req.body.amount),
        purpose: req.body.purpose,
        attachmentPath: req.file ? getPublicPath(req.file.filename, 'claims') : null,
      },
    });
    return htmxRedirect(req, res, {
      url: '/operations/iou',
      flash: { type: 'success', message: 'IOU request submitted.' },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/operations/iou',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.post('/iou/:id/approve', requirePermission('operations.iou'), async (req, res) => {
  const status = req.body.action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.iOURequest.update({
    where: { id: req.params.id },
    data: { status, approvedById: req.session.user.id, approvedAt: new Date() },
  });
  res.redirect(req.body.redirect || '/operations/iou');
});

router.post('/iou/:id/settle', requirePermission('operations.iou'), async (req, res) => {
  await prisma.iOURequest.update({
    where: { id: req.params.id },
    data: { status: 'SETTLED', settledAt: new Date() },
  });
  req.session.flash = { type: 'success', message: 'IOU marked as settled.' };
  res.redirect('/operations/iou/settlement');
});

router.get('/iou/reimbursement/form', requirePermission('operations.iou'), async (req, res) => {
  res.render('partials/forms/reimbursement.njk', {});
});

router.post('/iou/reimbursement', requirePermission('operations.iou'), setUploadCategory('claims'), upload.single('receipt'), async (req, res) => {
  const claimNo = await generateNumber('CLM', 'reimbursementClaim', 'claimNo');
  await prisma.reimbursementClaim.create({
    data: {
      claimNo,
      requesterId: req.session.user.id,
      amount: parseFloat(req.body.amount),
      purpose: req.body.purpose,
      receiptPath: req.file ? getPublicPath(req.file.filename, 'claims') : null,
    },
  });
  return htmxRedirect(req, res, {
    url: '/operations/iou/reimbursement',
    flash: { type: 'success', message: `Reimbursement claim ${claimNo} submitted.` },
  });
});

router.get('/petty-cash/form', requirePermission('operations.petty'), async (req, res) => {
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  res.render('partials/forms/petty-cash.njk', { branches });
});

router.get('/petty-cash', requirePermission('operations.petty'), async (req, res) => {
  const entries = await prisma.pettyCash.findMany({
    include: { branch: true },
    orderBy: { entryDate: 'desc' },
  });
  res.render('pages/operations/petty-cash.njk', {
    title: 'Petty Cash',
    activeModule: 'operations',
    entries,
  });
});

router.post('/petty-cash', requirePermission('operations.petty'), setUploadCategory('claims'), upload.single('attachment'), async (req, res) => {
  const entryNo = await generateNumber('PC', 'pettyCash', 'entryNo');
  await prisma.pettyCash.create({
    data: {
      entryNo,
      branchId: req.body.branchId || req.session.user.branchId,
      amount: parseFloat(req.body.amount),
      category: req.body.category,
      description: req.body.description,
      attachmentPath: req.file ? getPublicPath(req.file.filename, 'claims') : null,
    },
  });
  return htmxRedirect(req, res, {
    url: '/operations/petty-cash',
    flash: { type: 'success', message: 'Petty cash entry recorded.' },
  });
});

router.post('/petty-cash/:id/approve', requirePermission('operations.petty'), async (req, res) => {
  const status = req.body.action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.pettyCash.update({
    where: { id: req.params.id },
    data: { status },
  });
  req.session.flash = { type: 'success', message: `Petty cash entry ${status.toLowerCase()}.` };
  res.redirect('/operations/petty-cash/approve');
});

router.post('/reimbursement/:id/approve', requirePermission('operations.iou'), async (req, res) => {
  const status = req.body.action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.reimbursementClaim.update({
    where: { id: req.params.id },
    data: { status },
  });
  req.session.flash = { type: 'success', message: `Reimbursement claim ${status.toLowerCase()}.` };
  res.redirect('/operations/iou/reimbursement/approve');
});

export default router;
