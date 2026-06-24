import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getWarehouseDashboard, getWarehouseStock } from '../services/warehouseService.js';
import { fulfillIndent, completeStockTransfer } from '../services/stockService.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('warehouse.view'), async (req, res) => {
  const data = await getWarehouseDashboard();
  res.render('pages/warehouse/index.njk', {
    title: 'Warehouse Dashboard',
    activeModule: 'warehouse',
    ...data,
  });
});

router.get('/stock', requirePermission('warehouse.view'), async (req, res) => {
  const data = await getWarehouseStock();
  res.render('pages/warehouse/stock.njk', {
    title: 'Warehouse Stock',
    activeModule: 'warehouse',
    ...data,
  });
});

router.get('/dispatch', requirePermission('warehouse.dispatch'), async (req, res) => {
  const data = await getWarehouseDashboard();
  res.render('pages/warehouse/dispatch.njk', {
    title: 'Dispatch Queue',
    activeModule: 'warehouse',
    ...data,
  });
});

router.post('/dispatch/indent/:id', requirePermission('warehouse.dispatch'), async (req, res) => {
  try {
    await fulfillIndent({ indentId: req.params.id, createdById: req.session.user.id });
    req.session.flash = { type: 'success', message: 'Indent fulfilled and stock dispatched.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/warehouse/dispatch');
});

router.post('/dispatch/transfer/:id', requirePermission('warehouse.dispatch'), async (req, res) => {
  try {
    const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params.id } });
    if (transfer?.status === 'PENDING') {
      await prisma.stockTransfer.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED', approvedById: req.session.user.id, approvedAt: new Date() },
      });
    }
    await completeStockTransfer(req.params.id, req.session.user.id);
    req.session.flash = { type: 'success', message: 'Stock transfer completed.' };
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
  }
  res.redirect('/warehouse/dispatch');
});

export default router;
