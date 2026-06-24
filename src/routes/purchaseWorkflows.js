import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';
import { getWarehouseBranch } from '../services/warehouseService.js';
import {
  listAestheticsPOs,
  createAestheticsPO,
  authorizeAestheticsPO,
  listAestheticsGRNs,
  createAestheticsGRN,
  listAestheticsInvoices,
  createAestheticsInvoice,
  completeGrnQuality,
} from '../services/aestheticsWorkflowService.js';
import {
  listFactoryIndents,
  createFactoryIndent,
  approveFactoryIndent,
  receiveFactoryInward,
  listFactoryInwards,
} from '../services/factoryWorkflowService.js';
import {
  listAssetPOs,
  createAssetPO,
  authorizeAssetPO,
  createAssetGRN,
  listAssetGRNs,
} from '../services/assetWorkflowService.js';

const router = Router();
router.use(requireAuth);

// ─── Aesthetics PO ───────────────────────────────────────────────────────────

router.get('/purchase/aesthetics/orders', requirePermission('purchase.po'), async (req, res) => {
  const orders = await listAestheticsPOs({ q: req.query.q });
  res.render('pages/purchase/aesthetics/orders.njk', {
    title: 'Aesthetics — Center PO',
    activeModule: 'purchase',
    orders,
    filters: req.query,
  });
});

router.get('/purchase/aesthetics/orders/search', requirePermission('purchase.po'), async (req, res) => {
  const orders = await listAestheticsPOs({ q: req.query.q, status: req.query.status });
  res.render('pages/purchase/aesthetics/orders.njk', {
    title: 'Aesthetics — PO Search',
    activeModule: 'purchase',
    orders,
    filters: req.query,
  });
});

router.get('/purchase/aesthetics/orders/form', requirePermission('purchase.po'), async (req, res) => {
  const [vendors, branches, products] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true } }),
    prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } }),
    prisma.product.findMany({ where: { isActive: true }, take: 100 }),
  ]);
  res.render('partials/forms/aesthetics-po-create.njk', { vendors, branches, products });
});

router.post('/purchase/aesthetics/orders', requirePermission('purchase.po'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const po = await createAestheticsPO({
      vendorId: req.body.vendorId,
      branchId: req.body.branchId,
      items,
      notes: req.body.notes,
      expectedDate: req.body.expectedDate,
    });
    return htmxRedirect(req, res, {
      url: '/purchase/aesthetics/orders',
      flash: { type: 'success', message: `Aesthetics PO ${po.poNo} created — pending authorization.` },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/purchase/aesthetics/orders',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.get('/purchase/aesthetics/orders/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  const orders = await listAestheticsPOs({ status: 'PENDING_AUTH' });
  res.render('pages/purchase/aesthetics/order-authorize.njk', {
    title: 'Aesthetics — Approve PO',
    activeModule: 'purchase',
    orders,
  });
});

router.post('/purchase/aesthetics/orders/:id/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  try {
    await authorizeAestheticsPO({ poId: req.params.id, action: req.body.action });
    req.session.flash = { type: 'success', message: 'Aesthetics PO updated.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/aesthetics/orders/authorize');
});

// ─── Aesthetics GRN ────────────────────────────────────────────────────────────

router.get('/purchase/aesthetics/grn', requirePermission('purchase.grn'), async (req, res) => {
  const [approvedPOs, grns, branches] = await Promise.all([
    listAestheticsPOs({ status: 'APPROVED' }),
    listAestheticsGRNs(),
    prisma.branch.findMany({ where: { isActive: true } }),
  ]);
  const partialPOs = await listAestheticsPOs({ status: 'PARTIAL' });
  res.render('pages/purchase/aesthetics/grn.njk', {
    title: 'Aesthetics — Center GRN',
    activeModule: 'purchase',
    approvedPOs: [...approvedPOs, ...partialPOs],
    grns,
    branches,
    warehouse: await getWarehouseBranch(),
  });
});

router.get('/purchase/aesthetics/grn/search', requirePermission('purchase.grn'), async (req, res) => {
  const grns = await listAestheticsGRNs({ q: req.query.q, status: req.query.status });
  res.render('pages/purchase/aesthetics/grn-search.njk', {
    title: 'Aesthetics — GRN Search',
    activeModule: 'purchase',
    grns,
    filters: req.query,
  });
});

router.post('/purchase/aesthetics/grn', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const grn = await createAestheticsGRN({
      poId: req.body.poId,
      branchId: req.body.branchId,
      items,
      notes: req.body.notes,
    });
    req.session.flash = { type: 'success', message: `GRN ${grn.grnNo} submitted for quality check.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/aesthetics/grn');
});

router.get('/purchase/aesthetics/grn/:id/quality', requirePermission('purchase.grn'), async (req, res) => {
  const grn = await prisma.gRN.findFirst({
    where: { id: req.params.id, grnType: 'AESTHETICS' },
    include: { po: { include: { vendor: true, branch: true } }, items: { include: { product: true } } },
  });
  if (!grn) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'GRN not found' });
  res.render('pages/purchase/grn-quality.njk', {
    title: `Quality — ${grn.grnNo}`,
    activeModule: 'purchase',
    grn,
    backUrl: '/purchase/aesthetics/grn',
    qualityActionUrl: `/purchase/aesthetics/grn/${grn.id}/quality`,
    cancelUrl: '/purchase/aesthetics/grn/search',
  });
});

router.post('/purchase/aesthetics/grn/:id/quality', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const itemQuality = JSON.parse(req.body.itemQuality || '[]');
    await completeGrnQuality({
      grnId: req.params.id,
      action: req.body.action,
      itemQuality,
      checkedById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Quality check completed.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/aesthetics/grn/search?status=QUALITY_CHECK');
});

// ─── Aesthetics Invoice ────────────────────────────────────────────────────────

router.get('/purchase/aesthetics/invoices', requirePermission('purchase.po'), async (req, res) => {
  const [invoices, pendingGrns, customers] = await Promise.all([
    listAestheticsInvoices(),
    listAestheticsGRNs({ status: 'ACCEPTED' }),
    prisma.customer.findMany({ take: 100, orderBy: { firstName: 'asc' } }),
  ]);
  const uninvoicedGrns = pendingGrns.filter((g) => !g.bill);
  res.render('pages/purchase/aesthetics/invoices.njk', {
    title: 'Aesthetics — Invoice',
    activeModule: 'purchase',
    invoices,
    uninvoicedGrns,
    customers,
  });
});

router.post('/purchase/aesthetics/invoices', requirePermission('purchase.po'), async (req, res) => {
  try {
    const { bill, billNo } = await createAestheticsInvoice({
      grnId: req.body.grnId,
      customerId: req.body.customerId,
      createdById: req.session.user.id,
      paidAmount: req.body.paidAmount,
      paymentMode: req.body.paymentMode,
    });
    return htmxRedirect(req, res, {
      url: `/billing/${bill.id}`,
      flash: { type: 'success', message: `Invoice ${billNo} created from GRN.` },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/purchase/aesthetics/invoices',
      flash: { type: 'error', message: err.message },
    });
  }
});

// ─── Factory Indents ───────────────────────────────────────────────────────────

router.get('/purchase/factory/indents', requirePermission('purchase.po'), async (req, res) => {
  const indents = await listFactoryIndents({ status: req.query.status });
  res.render('pages/purchase/factory/indents.njk', {
    title: 'Factory Indents',
    activeModule: 'purchase',
    indents,
    filters: req.query,
  });
});

router.get('/purchase/factory/indents/search', requirePermission('purchase.po'), async (req, res) => {
  const indents = await listFactoryIndents({ q: req.query.q, status: req.query.status });
  res.render('pages/purchase/factory/indents-search.njk', {
    title: 'Factory Indent Search',
    activeModule: 'purchase',
    indents,
    filters: req.query,
  });
});

router.get('/purchase/factory/indents/form', requirePermission('purchase.po'), async (req, res) => {
  const [branches, products] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true }, take: 100 }),
  ]);
  res.render('partials/forms/factory-indent-create.njk', { branches, products });
});

router.post('/purchase/factory/indents', requirePermission('purchase.po'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const indent = await createFactoryIndent({
      branchId: req.body.branchId,
      items,
      notes: req.body.notes,
      createdById: req.session.user.id,
    });
    return htmxRedirect(req, res, {
      url: '/purchase/factory/indents',
      flash: { type: 'success', message: `Factory indent ${indent.indentNo} created.` },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/purchase/factory/indents',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.post('/purchase/factory/indents/:id/approve', requirePermission('purchase.authorize'), async (req, res) => {
  try {
    await approveFactoryIndent({
      indentId: req.params.id,
      action: req.body.action,
      approvedById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Factory indent updated.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/factory/indents');
});

// ─── Factory Inward ────────────────────────────────────────────────────────────

router.get('/purchase/factory/inward', requirePermission('purchase.grn'), async (req, res) => {
  const [indents, vendors, branches] = await Promise.all([
    listFactoryIndents({ status: 'APPROVED' }),
    prisma.vendor.findMany({ where: { isActive: true } }),
    prisma.branch.findMany({ where: { isActive: true } }),
  ]);
  const partialIndents = await listFactoryIndents({ status: 'PARTIAL' });
  res.render('pages/purchase/factory/inward.njk', {
    title: 'Factory Inward',
    activeModule: 'purchase',
    indents: [...indents, ...partialIndents],
    vendors,
    branches,
    warehouse: await getWarehouseBranch(),
  });
});

router.get('/purchase/factory/inward/search', requirePermission('purchase.grn'), async (req, res) => {
  const inwards = await listFactoryInwards({ q: req.query.q, status: req.query.status });
  res.render('pages/purchase/factory/inward-search.njk', {
    title: 'Factory Inward Search',
    activeModule: 'purchase',
    inwards,
    filters: req.query,
  });
});

router.post('/purchase/factory/inward', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const { grn } = await receiveFactoryInward({
      indentId: req.body.indentId,
      vendorId: req.body.vendorId,
      branchId: req.body.branchId,
      items,
      notes: req.body.notes,
      createdById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: `Factory inward ${grn.grnNo} recorded — pending QC.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/factory/inward');
});

router.get('/purchase/factory/inward/quality', requirePermission('purchase.grn'), async (req, res) => {
  const inwards = await listFactoryInwards({ status: 'QUALITY_CHECK' });
  res.render('pages/purchase/factory/inward-quality.njk', {
    title: 'Factory Inward Quality',
    activeModule: 'purchase',
    inwards,
  });
});

router.get('/purchase/factory/inward/report', requirePermission('purchase.grn'), async (req, res) => {
  const inwards = await listFactoryInwards({ status: 'ACCEPTED' });
  res.render('pages/purchase/factory/inward-report.njk', {
    title: 'Factory Inward Report',
    activeModule: 'purchase',
    inwards,
  });
});

router.get('/purchase/factory/inward/:id/quality', requirePermission('purchase.grn'), async (req, res) => {
  const grn = await prisma.gRN.findFirst({
    where: { id: req.params.id, grnType: 'FACTORY' },
    include: { po: { include: { vendor: true } }, factoryIndent: true, items: { include: { product: true } } },
  });
  if (!grn) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'GRN not found' });
  res.render('pages/purchase/grn-quality.njk', {
    title: `Factory QC — ${grn.grnNo}`,
    activeModule: 'purchase',
    grn,
    backUrl: '/purchase/factory/inward/quality',
    qualityActionUrl: `/purchase/factory/inward/${grn.id}/quality`,
    cancelUrl: '/purchase/factory/inward/quality',
  });
});

router.post('/purchase/factory/inward/:id/quality', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const itemQuality = JSON.parse(req.body.itemQuality || '[]');
    await completeGrnQuality({
      grnId: req.params.id,
      action: req.body.action,
      itemQuality,
      checkedById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Factory inward quality completed.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/factory/inward/quality');
});

// ─── Asset PO ──────────────────────────────────────────────────────────────────

router.get('/purchase/asset-po/search', requirePermission('purchase.authorize'), async (req, res) => {
  const orders = await listAssetPOs({ q: req.query.q, status: req.query.status });
  res.render('pages/purchase/asset/orders.njk', {
    title: 'Asset PO Search',
    activeModule: 'purchase',
    orders,
    filters: req.query,
  });
});

router.get('/purchase/asset-po/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  const orders = await listAssetPOs({ status: 'PENDING_AUTH' });
  res.render('pages/purchase/asset/order-authorize.njk', {
    title: 'Asset PO Authorization',
    activeModule: 'purchase',
    orders,
  });
});

router.get('/purchase/asset-po/form', requirePermission('purchase.po'), async (req, res) => {
  const vendors = await prisma.vendor.findMany({ where: { isActive: true } });
  res.render('partials/forms/asset-po-create.njk', { vendors });
});

router.post('/purchase/asset-po', requirePermission('purchase.po'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const apo = await createAssetPO({
      vendorId: req.body.vendorId,
      items,
      notes: req.body.notes,
      createdById: req.session.user.id,
    });
    return htmxRedirect(req, res, {
      url: '/purchase/asset-po/search',
      flash: { type: 'success', message: `Asset PO ${apo.apoNo} created.` },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/purchase/asset-po/search',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.post('/purchase/asset-po/:id/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  try {
    await authorizeAssetPO({ apoId: req.params.id, action: req.body.action });
    req.session.flash = { type: 'success', message: 'Asset PO updated.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/asset-po/authorize');
});

router.get('/purchase/asset-grn', requirePermission('purchase.grn'), async (req, res) => {
  const [approvedAPOs, grns, branches] = await Promise.all([
    listAssetPOs({ status: 'APPROVED' }),
    listAssetGRNs(),
    prisma.branch.findMany({ where: { isActive: true } }),
  ]);
  res.render('pages/purchase/asset/grn.njk', {
    title: 'Asset GRN (Open)',
    activeModule: 'purchase',
    approvedAPOs,
    grns,
    branches,
    warehouse: await getWarehouseBranch(),
  });
});

router.post('/purchase/asset-grn', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const grn = await createAssetGRN({
      apoId: req.body.apoId,
      vendorId: req.body.vendorId,
      branchId: req.body.branchId,
      notes: req.body.notes,
    });
    req.session.flash = { type: 'success', message: `Asset GRN ${grn.grnNo} created.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/asset-grn');
});

export default router;
