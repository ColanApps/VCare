import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';
import { getWarehouseBranch } from '../services/warehouseService.js';
import {
  createGrnReceipt,
  getPendingGrns,
  getGrnPendingProducts,
  completeGrnQuality,
} from '../services/grnService.js';
import {
  createWorkOrder,
  authorizeWorkOrder,
  completeWorkOrder,
} from '../services/workOrderService.js';

const router = Router();
router.use(requireAuth);

router.get('/vendors/form', requirePermission('purchase.vendors'), async (req, res) => {
  res.render('partials/forms/vendor.njk', {});
});

router.get('/vendors', requirePermission('purchase.vendors'), async (req, res) => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  res.render('pages/purchase/vendors.njk', { title: 'Vendor Master', activeModule: 'purchase', vendors });
});

router.post('/vendors', requirePermission('purchase.vendors'), async (req, res) => {
  await prisma.vendor.create({
    data: {
      code: req.body.code,
      name: req.body.name,
      type: req.body.type || 'BILLABLE',
      contact: req.body.contact,
      email: req.body.email,
      phone: req.body.phone,
      gstin: req.body.gstin,
      address: req.body.address,
      paymentTerms: req.body.paymentTerms || null,
      creditDays: req.body.creditDays ? parseInt(req.body.creditDays, 10) : null,
      bankName: req.body.bankName || null,
      bankAccount: req.body.bankAccount || null,
    },
  });
  return htmxRedirect(req, res, {
    url: '/purchase/vendors',
    flash: { type: 'success', message: 'Vendor created.' },
  });
});

router.post('/vendors/:id', requirePermission('purchase.vendors'), async (req, res) => {
  await prisma.vendor.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      type: req.body.type || 'BILLABLE',
      contact: req.body.contact,
      email: req.body.email,
      phone: req.body.phone,
      gstin: req.body.gstin,
      address: req.body.address,
      paymentTerms: req.body.paymentTerms || null,
      creditDays: req.body.creditDays ? parseInt(req.body.creditDays, 10) : null,
      bankName: req.body.bankName || null,
      bankAccount: req.body.bankAccount || null,
      isActive: req.body.isActive !== 'off',
    },
  });
  req.session.flash = { type: 'success', message: 'Vendor updated.' };
  res.redirect('/purchase/vendors');
});

router.get('/orders', requirePermission('purchase.po'), async (req, res) => {
  const orders = await prisma.purchaseOrder.findMany({
    include: { vendor: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/purchase/orders.njk', { title: 'Purchase Orders', activeModule: 'purchase', orders });
});

router.get('/orders/create', requirePermission('purchase.po'), async (req, res) => {
  const [vendors, products] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true } }),
  ]);
  const data = { vendors, products };
  if (isHtmx(req)) return res.render('partials/forms/purchase-order-create.njk', data);

  const orders = await prisma.purchaseOrder.findMany({
    include: { vendor: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.render('pages/purchase/orders.njk', {
    title: 'Purchase Orders',
    activeModule: 'purchase',
    orders,
    autoOpenModal: { title: 'Create Purchase Order', size: 'xl', url: '/purchase/orders/create' },
  });
});

router.post('/orders/create', requirePermission('purchase.po'), async (req, res) => {
  const poNo = await generateNumber('PO', 'purchaseOrder', 'poNo');
  const items = JSON.parse(req.body.items || '[]');
  let totalAmount = 0;

  const poItems = items.map((i) => {
    const total = i.quantity * i.unitPrice;
    totalAmount += total;
    return { productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, totalAmount: total };
  });

  await prisma.purchaseOrder.create({
    data: {
      poNo,
      vendorId: req.body.vendorId,
      orderType: 'STANDARD',
      status: 'PENDING_AUTH',
      expectedDate: req.body.expectedDate ? new Date(req.body.expectedDate) : null,
      totalAmount,
      notes: req.body.notes,
      items: { create: poItems },
    },
  });

  return htmxRedirect(req, res, {
    url: '/purchase/orders',
    flash: { type: 'success', message: `PO ${poNo} created.` },
  });
});

router.get('/orders/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  const orders = await prisma.purchaseOrder.findMany({
    where: { status: 'PENDING_AUTH' },
    include: { vendor: true, items: { include: { product: true } } },
  });
  res.render('pages/purchase/order-authorize.njk', {
    title: 'PO Authorization',
    activeModule: 'purchase',
    orders,
  });
});

router.post('/orders/:id/authorize', requirePermission('purchase.authorize'), async (req, res) => {
  await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status: req.body.action === 'approve' ? 'APPROVED' : 'CANCELLED' },
  });
  req.session.flash = { type: 'success', message: 'PO updated.' };
  res.redirect('/purchase/orders/authorize');
});

router.get('/grn', requirePermission('purchase.grn'), async (req, res) => {
  const approvedPOs = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['APPROVED', 'PARTIAL'] } },
    include: { vendor: true, items: { include: { product: true } }, grns: { include: { items: true } } },
  });
  const grns = await prisma.gRN.findMany({
    include: { po: { include: { vendor: true } }, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  const warehouse = await getWarehouseBranch();
  res.render('pages/purchase/grn.njk', {
    title: 'Goods Receipt Note',
    activeModule: 'purchase',
    approvedPOs,
    grns,
    branches,
    warehouse,
  });
});

router.post('/grn', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || '[]');
    const branchId = req.body.branchId || (await getWarehouseBranch())?.id;
    if (!branchId) throw new Error('No warehouse branch configured for GRN receipt');

    const grn = await createGrnReceipt({
      poId: req.body.poId,
      branchId,
      items,
      notes: req.body.notes,
    });

    req.session.flash = { type: 'success', message: `GRN ${grn.grnNo} created — pending quality check.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/grn');
});

router.get('/grn/pending', requirePermission('purchase.grn'), async (req, res) => {
  const [pendingGrns, pendingProducts] = await Promise.all([getPendingGrns(), getGrnPendingProducts()]);
  res.render('pages/purchase/grn-pending.njk', {
    title: 'GRN Pending',
    activeModule: 'purchase',
    pendingGrns,
    pendingProducts,
  });
});

router.get('/grn/search', requirePermission('purchase.grn'), async (req, res) => {
  const where = {
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.q ? { OR: [{ grnNo: { contains: req.query.q } }, { po: { poNo: { contains: req.query.q } } }] } : {}),
  };
  const grns = await prisma.gRN.findMany({
    where,
    include: { po: { include: { vendor: true } }, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.render('pages/purchase/grn-search.njk', {
    title: 'GRN Search',
    activeModule: 'purchase',
    grns,
    filters: req.query,
  });
});

router.get('/grn/:id/quality', requirePermission('purchase.grn'), async (req, res) => {
  const grn = await prisma.gRN.findUnique({
    where: { id: req.params.id },
    include: { po: { include: { vendor: true } }, items: { include: { product: true } } },
  });
  if (!grn) return res.status(404).render('pages/error.njk', { title: 'Not Found', code: 404, message: 'GRN not found' });
  res.render('pages/purchase/grn-quality.njk', {
    title: `Quality Check — ${grn.grnNo}`,
    activeModule: 'purchase',
    grn,
  });
});

router.post('/grn/:id/quality', requirePermission('purchase.grn'), async (req, res) => {
  try {
    const itemQuality = JSON.parse(req.body.itemQuality || '[]');
    await completeGrnQuality({
      grnId: req.params.id,
      action: req.body.action,
      itemQuality,
      checkedById: req.session.user.id,
    });
    req.session.flash = {
      type: 'success',
      message: req.body.action === 'reject' ? 'GRN rejected.' : 'Quality approved — stock updated.',
    };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/purchase/grn/pending');
});

router.get('/work-orders', requirePermission('purchase.workorder'), async (req, res) => {
  const orders = await prisma.workOrder.findMany({
    include: { branch: true, vendor: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/purchase/work-orders.njk', { title: 'Work Orders', activeModule: 'purchase', orders });
});

router.get('/work-orders/create', requirePermission('purchase.workorder'), async (req, res) => {
  const [branches, vendors, products] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.vendor.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true }, take: 100 }),
  ]);
  const data = { branches, vendors, products };
  if (isHtmx(req)) return res.render('partials/forms/work-order-create.njk', data);

  const orders = await prisma.workOrder.findMany({
    include: { branch: true, vendor: true, items: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.render('pages/purchase/work-orders.njk', {
    title: 'Work Orders',
    activeModule: 'purchase',
    orders,
    autoOpenModal: { title: 'Create Work Order', size: 'lg', url: '/purchase/work-orders/create' },
  });
});

router.post('/work-orders/create', requirePermission('purchase.workorder'), async (req, res) => {
  const items = JSON.parse(req.body.items || '[]');
  const order = await createWorkOrder({
    branchId: req.body.branchId || req.session.user.branchId,
    vendorId: req.body.vendorId || null,
    description: req.body.description,
    notes: req.body.notes,
    items,
    createdById: req.session.user.id,
  });
  return htmxRedirect(req, res, {
    url: '/purchase/work-orders',
    flash: { type: 'success', message: `Work order ${order.woNo} created.` },
  });
});

router.post('/work-orders/:id/authorize', requirePermission('purchase.workorder'), async (req, res) => {
  await authorizeWorkOrder({
    workOrderId: req.params.id,
    action: req.body.action,
    authorizedById: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: 'Work order updated.' };
  res.redirect('/purchase/work-orders');
});

router.post('/work-orders/:id/complete', requirePermission('purchase.workorder'), async (req, res) => {
  await completeWorkOrder(req.params.id, req.session.user.id);
  req.session.flash = { type: 'success', message: 'Work order marked complete — stock received at warehouse.' };
  res.redirect('/purchase/work-orders');
});

export default router;
