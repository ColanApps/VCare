import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission, branchScope } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { htmxRedirect, isHtmx } from '../lib/htmx.js';
import { resolveBranchId, branchEntityListWhere } from '../utils/branchHelpers.js';
import { fulfillIndent, getStockMovements, recordClinicalConsumption, createStockTransfer, approveStockTransfer, completeStockTransfer, adjustStock } from '../services/stockService.js';
import { createIndent } from '../services/indentService.js';
import { createStockOutward, authorizeStockOutward, recordPhysicalAudit } from '../services/stockOutwardService.js';

const router = Router();
router.use(requireAuth, branchScope);

router.get('/products/form', requirePermission('inventory.products'), async (req, res) => {
  const vendors = await prisma.vendor.findMany({ where: { isActive: true } });
  res.render('partials/forms/product.njk', { vendors });
});

router.get('/products', requirePermission('inventory.products'), async (req, res) => {
  const type = req.query.type || 'ALL';
  const products = await prisma.product.findMany({
    where: type !== 'ALL' ? { type } : {},
    include: { vendor: true },
    orderBy: { name: 'asc' },
  });
  res.render('pages/inventory/products.njk', { title: 'Product Master', activeModule: 'inventory', products, selectedType: type });
});

router.post('/products', requirePermission('inventory.products'), async (req, res) => {
  await prisma.product.create({
    data: {
      sku: req.body.sku,
      name: req.body.name,
      type: req.body.type || 'BILLABLE',
      category: req.body.category,
      hsnCode: req.body.hsnCode,
      unit: req.body.unit || 'PCS',
      mrp: parseFloat(req.body.mrp) || 0,
      costPrice: parseFloat(req.body.costPrice) || 0,
      taxRate: parseFloat(req.body.taxRate) || 18,
      vendorId: req.body.vendorId || null,
      reorderLevel: parseInt(req.body.reorderLevel, 10) || 10,
    },
  });
  return htmxRedirect(req, res, {
    url: '/inventory/products',
    flash: { type: 'success', message: 'Product added.' },
  });
});

router.post('/products/:id', requirePermission('inventory.products'), async (req, res) => {
  await prisma.product.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      type: req.body.type || 'BILLABLE',
      category: req.body.category,
      hsnCode: req.body.hsnCode,
      unit: req.body.unit || 'PCS',
      mrp: parseFloat(req.body.mrp) || 0,
      costPrice: parseFloat(req.body.costPrice) || 0,
      taxRate: parseFloat(req.body.taxRate) || 18,
      vendorId: req.body.vendorId || null,
      reorderLevel: parseInt(req.body.reorderLevel, 10) || 10,
      isActive: req.body.isActive !== 'off',
    },
  });
  req.session.flash = { type: 'success', message: 'Product updated.' };
  res.redirect('/inventory/products');
});

router.post('/stock/adjust', requirePermission('inventory.stock'), async (req, res) => {
  try {
    await adjustStock({
      productId: req.body.productId,
      branchId: resolveBranchId({ bodyBranchId: req.body.branchId, userBranchId: req.session.user.branchId }),
      quantity: parseInt(req.body.quantity, 10),
      movementType: req.body.movementType || 'ADJUSTMENT',
      notes: req.body.notes,
      createdById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Stock adjusted.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/stock');
});

router.get('/stock', requirePermission('inventory.stock'), async (req, res) => {
  const type = req.query.type || 'BILLABLE';
  const stocks = await prisma.stock.findMany({
    where: {
      ...(branchEntityListWhere(req.branchFilter)),
      product: { type },
    },
    include: { product: true, branch: true },
    orderBy: { product: { name: 'asc' } },
  });
  const products = await prisma.product.findMany({ where: { type, isActive: true }, orderBy: { name: 'asc' } });
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  res.render('pages/inventory/stock.njk', {
    title: type === 'CLINICAL' ? 'Clinical Center Stock' : 'Billable Center Stock',
    activeModule: 'inventory',
    stocks,
    products,
    branches,
    stockType: type,
  });
});

router.get('/movements', requirePermission('inventory.stock'), async (req, res) => {
  const movements = await getStockMovements(req.branchFilter.branchId);
  res.render('pages/inventory/movements.njk', {
    title: 'Stock Movement Log',
    activeModule: 'inventory',
    movements,
  });
});

router.get('/clinical-consumption', requirePermission('inventory.clinical'), async (req, res) => {
  const [products, consumptions, customers] = await Promise.all([
    prisma.product.findMany({ where: { type: 'CLINICAL', isActive: true } }),
    prisma.clinicalConsumption.findMany({
      where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
      include: { product: true, branch: true },
      orderBy: { consumedAt: 'desc' },
      take: 50,
    }),
    prisma.customer.findMany({ where: req.branchFilter, take: 50 }),
  ]);
  res.render('pages/inventory/clinical-consumption.njk', {
    title: 'Clinical Consumption',
    activeModule: 'inventory',
    products,
    consumptions,
    customers,
  });
});

router.post('/clinical-consumption', requirePermission('inventory.clinical'), async (req, res) => {
  try {
    await recordClinicalConsumption({
      branchId: resolveBranchId({ bodyBranchId: req.body.branchId, userBranchId: req.session.user.branchId }),
      productId: req.body.productId,
      quantity: parseInt(req.body.quantity, 10),
      customerId: req.body.customerId || null,
      procedureId: req.body.procedureId || null,
      notes: req.body.notes,
      consumedById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: 'Clinical consumption recorded.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/clinical-consumption');
});

router.get('/indents', requirePermission('inventory.indent'), async (req, res) => {
  const type = req.query.type;
  const indents = await prisma.indent.findMany({
    where: { ...req.branchFilter, ...(type ? { type } : {}) },
    include: { branch: true, createdBy: true, approvedBy: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.render('pages/inventory/indents.njk', { title: 'Indent Search', activeModule: 'inventory', indents, selectedType: type });
});

router.get('/indents/create', requirePermission('inventory.indent'), async (req, res) => {
  const indentType = req.query.type || 'BILLABLE';
  const [products, branches] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true, type: indentType } }),
    prisma.branch.findMany({ where: { isActive: true } }),
  ]);
  const data = { products, branches, indentType };
  if (isHtmx(req)) return res.render('partials/forms/indent-create.njk', data);

  const indents = await prisma.indent.findMany({
    include: { branch: true, createdBy: true, approvedBy: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.render('pages/inventory/indents.njk', {
    title: 'Indent Search',
    activeModule: 'inventory',
    indents,
    autoOpenModal: { title: 'Raise Indent', size: 'lg', url: '/inventory/indents/create' },
  });
});

router.post('/indents/create', requirePermission('inventory.indent'), async (req, res) => {
  const items = JSON.parse(req.body.items || '[]');
  try {
    const indent = await createIndent({
      branchId: resolveBranchId({ bodyBranchId: req.body.branchId, userBranchId: req.session.user.branchId }),
      type: req.body.type || 'BILLABLE',
      items,
      createdById: req.session.user.id,
      notes: req.body.notes,
      sourceType: 'MANUAL',
    });
    return htmxRedirect(req, res, {
      url: '/inventory/indents',
      flash: { type: 'success', message: `Indent ${indent.indentNo} raised.` },
    });
  } catch (err) {
    return htmxRedirect(req, res, {
      url: '/inventory/indents',
      flash: { type: 'error', message: err.message },
    });
  }
});

router.get('/indents/authorize', requirePermission('inventory.authorize'), async (req, res) => {
  const [pending, approved] = await Promise.all([
    prisma.indent.findMany({
      where: { status: 'PENDING' },
      include: { branch: true, createdBy: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.indent.findMany({
      where: { status: 'APPROVED' },
      include: { branch: true, createdBy: true, items: { include: { product: true } } },
      orderBy: { approvedAt: 'asc' },
    }),
  ]);
  res.render('pages/inventory/indent-authorize.njk', {
    title: 'Indent Authorization',
    activeModule: 'inventory',
    indents: pending,
    approvedIndents: approved,
  });
});

router.post('/indents/:id/authorize', requirePermission('inventory.authorize'), async (req, res) => {
  const status = req.body.action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.indent.update({
    where: { id: req.params.id },
    data: {
      status,
      approvedById: req.session.user.id,
      approvedAt: new Date(),
    },
  });
  if (status === 'APPROVED') {
    const { onIndentApproved } = await import('../services/supplyChainOrchestrationService.js');
    await onIndentApproved({ indentId: req.params.id, authorizedById: req.session.user.id }).catch(() => {});
  }
  req.session.flash = { type: 'success', message: `Indent ${status.toLowerCase()}.` };
  res.redirect('/inventory/indents/authorize');
});

router.post('/indents/:id/fulfill', requirePermission('inventory.authorize'), async (req, res) => {
  try {
    await fulfillIndent({ indentId: req.params.id, createdById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Indent fulfilled and stock transferred.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/indents');
});

router.get('/stock-transfers', requirePermission('inventory.transfer'), async (req, res) => {
  const transfers = await prisma.stockTransfer.findMany({
    include: { fromBranch: true, toBranch: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const [branches, products] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true, type: 'BILLABLE' } }),
  ]);
  res.render('pages/inventory/stock-transfers.njk', {
    title: 'Stock Transfer (STO)',
    activeModule: 'inventory',
    transfers,
    branches,
    products,
  });
});

router.post('/stock-transfers', requirePermission('inventory.transfer'), async (req, res) => {
  const items = JSON.parse(req.body.items || '[]');
  const transfer = await createStockTransfer({
    fromBranchId: req.body.fromBranchId,
    toBranchId: req.body.toBranchId,
    items,
    notes: req.body.notes,
    createdById: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: `STO ${transfer.transferNo} created.` };
  res.redirect('/inventory/stock-transfers');
});

router.post('/stock-transfers/:id/approve', requirePermission('inventory.transfer'), async (req, res) => {
  await approveStockTransfer(req.params.id, req.session.user.id);
  req.session.flash = { type: 'success', message: 'Stock transfer approved.' };
  res.redirect('/inventory/stock-transfers');
});

router.post('/stock-transfers/:id/complete', requirePermission('inventory.transfer'), async (req, res) => {
  try {
    await completeStockTransfer(req.params.id, req.session.user.id);
    req.session.flash = { type: 'success', message: 'Stock transfer completed.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/stock-transfers');
});

router.get('/stock-outward', requirePermission('inventory.outward'), async (req, res) => {
  const outwards = await prisma.stockOutward.findMany({
    where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
    include: { branch: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const products = await prisma.product.findMany({ where: { isActive: true } });
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  res.render('pages/inventory/stock-outward.njk', {
    title: 'Stock Outward',
    activeModule: 'inventory',
    outwards,
    products,
    branches,
  });
});

router.post('/stock-outward', requirePermission('inventory.outward'), async (req, res) => {
  const items = JSON.parse(req.body.items || '[]');
  const outward = await createStockOutward({
    branchId: resolveBranchId({ bodyBranchId: req.body.branchId, userBranchId: req.session.user.branchId }),
    stockType: req.body.stockType,
    destination: req.body.destination,
    notes: req.body.notes,
    items,
    createdById: req.session.user.id,
  });
  req.session.flash = { type: 'success', message: `Outward ${outward.outwardNo} created — pending authorization.` };
  res.redirect('/inventory/stock-outward');
});

router.post('/stock-outward/:id/authorize', requirePermission('inventory.outward'), async (req, res) => {
  try {
    await authorizeStockOutward({ outwardId: req.params.id, authorizedById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Stock outward authorized and stock deducted.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/stock-outward');
});

router.get('/physical-stock', requirePermission('inventory.stock'), async (req, res) => {
  const audits = await prisma.physicalStockAudit.findMany({
    where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
    include: { product: true, branch: true },
    orderBy: { auditedAt: 'desc' },
    take: 100,
  });
  const [products, branches, stocks] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true } }),
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.stock.findMany({
      where: req.branchFilter.branchId ? { branchId: req.branchFilter.branchId } : {},
      include: { product: true },
    }),
  ]);
  res.render('pages/inventory/physical-stock.njk', {
    title: 'Physical Stock Audit',
    activeModule: 'inventory',
    audits,
    products,
    branches,
    stocks,
  });
});

router.post('/physical-stock', requirePermission('inventory.stock'), async (req, res) => {
  try {
    const audit = await recordPhysicalAudit({
      branchId: resolveBranchId({ bodyBranchId: req.body.branchId, userBranchId: req.session.user.branchId }),
      productId: req.body.productId,
      physicalQty: req.body.physicalQty,
      notes: req.body.notes,
      auditedById: req.session.user.id,
    });
    req.session.flash = { type: 'success', message: `Audit ${audit.auditNo} recorded. Variance: ${audit.variance}` };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/inventory/physical-stock');
});

router.get('/kit-shortfall', requirePermission('inventory.stock'), async (req, res) => {
  const {
    getLowStockByReorder,
    getKitShortfalls,
    getUpcomingProcedureShortfalls,
    getProcedureKitShortfalls,
  } = await import('../services/kitShortfallService.js');

  const branchFilter = req.branchFilter || {};
  const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const branchId = req.query.branchId || req.session.user.branchId || branches[0]?.id;

  const [lowStock, kitShortfalls, procedureShortfalls] = await Promise.all([
    getLowStockByReorder(branchId ? { branchId } : branchFilter),
    branchId ? getKitShortfalls(branchId) : Promise.resolve([]),
    getUpcomingProcedureShortfalls(branchId ? { branchId } : branchFilter, 50),
  ]);

  let focusedProcedure = null;
  if (req.query.procedureId) {
    const shortfalls = await getProcedureKitShortfalls(req.query.procedureId);
    const procedure = await prisma.procedure.findUnique({
      where: { id: req.query.procedureId },
      include: { customer: true, treatment: true },
    });
    if (procedure) focusedProcedure = { procedure, shortfalls };
  }

  res.render('pages/inventory/kit-shortfall.njk', {
    title: 'Kit Shortfall Alerts',
    activeModule: 'inventory',
    branches,
    branchId,
    lowStock,
    kitShortfalls,
    procedureShortfalls,
    focusedProcedure,
  });
});

export default router;
