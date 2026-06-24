import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { assertCreatePaymentAllowed } from '../services/billingService.js';
import {
  createSalesOrder,
  createDeliveryChallan,
  invoiceSalesOrder,
} from '../services/salesOrderService.js';
import { streamDeliveryChallanPdf } from '../services/documentPdfService.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/orders', requirePermission('sales.view'), async (req, res) => {
  const orders = await prisma.salesOrder.findMany({
    where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
    include: { customer: true, branch: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/sales/orders.njk', { title: 'Sales Orders', activeModule: 'sales', orders });
});

router.get('/orders/create', requirePermission('sales.create'), async (req, res) => {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: req.branchFilter, take: 200 }),
    prisma.product.findMany({ where: { type: 'BILLABLE', isActive: true } }),
  ]);
  const data = { customers, products };
  if (isHtmx(req)) return res.render('partials/forms/sales-order-create.njk', data);

  const orders = await prisma.salesOrder.findMany({
    where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
    include: { customer: true, branch: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.render('pages/sales/orders.njk', {
    title: 'Sales Orders',
    activeModule: 'sales',
    orders,
    autoOpenModal: { title: 'Create Sales Order', size: 'xl', url: '/sales/orders/create' },
  });
});

router.post('/orders/create', requirePermission('sales.create'), async (req, res) => {
  const items = JSON.parse(req.body.items || '[]');
  const order = await createSalesOrder({
    customerId: req.body.customerId,
    branchId: req.body.branchId || req.session.user.branchId,
    items,
    notes: req.body.notes,
    createdById: req.session.user.id,
  });
  return htmxRedirect(req, res, {
    url: '/sales/orders',
    flash: { type: 'success', message: `Sales order ${order.orderNo} created.` },
  });
});

router.post('/orders/:id/challan', requirePermission('sales.create'), async (req, res) => {
  const dc = await createDeliveryChallan({
    orderId: req.params.id,
    notes: req.body.notes,
    createdById: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: `Delivery challan ${dc.challanNo} issued.` };
  res.redirect('/sales/orders');
});

router.post('/orders/:id/invoice', requirePermission('sales.invoice'), async (req, res) => {
  try {
    assertCreatePaymentAllowed(req.body.paidAmount, req.session.user.roleCode);
    const bill = await invoiceSalesOrder({
      orderId: req.params.id,
      createdById: req.session.user.id,
      paidAmount: req.body.paidAmount,
      paymentMode: req.body.paymentMode,
      roleCode: req.session.user.roleCode,
    });
    req.session.flash = { type: 'success', message: `Invoice ${bill.billNo} generated.` };
    res.redirect(`/billing/${bill.id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect('/sales/orders');
  }
});

router.get('/challans/:id/pdf', requirePermission('sales.view'), async (req, res) => {
  try {
    await streamDeliveryChallanPdf(req.params.id, res);
  } catch (err) {
    res.status(404).send(err.message);
  }
});

router.get('/challans', requirePermission('sales.view'), async (req, res) => {
  const challans = await prisma.deliveryChallan.findMany({
    include: { order: { include: { customer: true, items: { include: { product: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/sales/challans.njk', { title: 'Delivery Challans', activeModule: 'sales', challans });
});

export default router;
