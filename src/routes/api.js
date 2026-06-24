import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { sendNotification } from '../utils/audit.js';
import { config } from '../config/index.js';
import { createPharmacyBill } from '../services/pharmacyService.js';

const router = Router();

function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey !== config.apiKey) {
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }
  next();
}

// Call Center Dialer Integration
router.post('/call-center/appointments', requireApiKey, async (req, res) => {
  try {
    const { customerPhone, customerName, email, branchCode, consultantId, scheduledAt, category, leadSource, campaign } = req.body;

    if (!customerPhone || !scheduledAt || !branchCode) {
      return res.status(400).json({ success: false, error: 'Missing required fields: customerPhone, scheduledAt, branchCode' });
    }

    const { bookDialerAppointment } = await import('../services/callCenterBookingService.js');
    const result = await bookDialerAppointment({
      customerPhone,
      customerName,
      email,
      branchCode,
      consultantId,
      scheduledAt,
      category,
      leadSource: leadSource || 'CALL_CENTER',
      campaign,
      bookedById: null,
      createFollowUp: req.body.createFollowUp === true || req.body.createFollowUp === 'true',
    });

    res.json({
      success: true,
      data: {
        appointmentId: result.appointment.id,
        appointmentNo: result.appointment.appointmentNo,
        customerUhid: result.customer.uhid,
        scheduledAt: result.appointment.scheduledAt,
        branch: result.customer.branch?.name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/call-center/slots', requireApiKey, async (req, res) => {
  const { branchCode, date, consultantId } = req.query;
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });

  const { getAvailableSlots } = await import('../services/callCenterBookingService.js');
  const slots = await getAvailableSlots({ branchId: branch.id, date, consultantId });

  res.json({ success: true, data: { branch: branch.name, slots } });
});

router.get('/call-center/customer/:phone', requireApiKey, async (req, res) => {
  const { lookupCustomerByPhone } = await import('../services/callCenterBookingService.js');
  const customer = await lookupCustomerByPhone(req.params.phone);

  if (!customer) return res.json({ success: true, data: null });
  const full = await prisma.customer.findFirst({
    where: { id: customer.id },
    include: {
      branch: true,
      appointments: { orderBy: { scheduledAt: 'desc' }, take: 5 },
      bills: { orderBy: { billDate: 'desc' }, take: 3 },
    },
  });
  res.json({ success: true, data: full });
});

// Online Order to Invoice Integration
router.post('/online-orders', requireApiKey, async (req, res) => {
  try {
    const { orderNo, customerName, customerEmail, customerPhone, items, paymentStatus } = req.body;

    if (!orderNo || !customerPhone || !items?.length) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const existing = await prisma.onlineOrder.findUnique({ where: { orderNo } });
    if (existing?.status === 'INVOICED') {
      return res.status(409).json({ success: false, error: 'Order already invoiced', billId: existing.billId });
    }

    const duplicateBill = await prisma.bill.findFirst({ where: { onlineOrderId: orderNo } });
    if (duplicateBill) {
      return res.status(409).json({ success: false, error: 'Duplicate order', billId: duplicateBill.id });
    }

    const branch = req.body.branchCode
      ? await prisma.branch.findUnique({ where: { code: req.body.branchCode } })
      : await prisma.branch.findFirst({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
    if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });
    const admin = await prisma.user.findFirst({ where: { role: { code: 'SUPER_ADMIN' } } });

    let customer = await prisma.customer.findFirst({ where: { phone: customerPhone } });
    if (!customer) {
      const uhid = await generateNumber('UHID', 'customer', 'uhid');
      const [firstName, ...rest] = (customerName || 'Online Customer').split(' ');
      customer = await prisma.customer.create({
        data: {
          uhid,
          firstName,
          lastName: rest.join(' ') || '.',
          phone: customerPhone,
          email: customerEmail,
          branchId: branch.id,
          leadSource: 'ONLINE',
        },
      });
    }

    const pharmacyItems = [];
    for (const item of items) {
      const product = item.productId
        ? await prisma.product.findUnique({ where: { id: item.productId } })
        : await prisma.product.findFirst({ where: { sku: item.sku || item.code, isActive: true } });
      if (product) {
        pharmacyItems.push({ productId: product.id, quantity: item.quantity, discount: item.discount });
      }
    }

    let bill;
    if (pharmacyItems.length === items.length && pharmacyItems.length > 0) {
      bill = await createPharmacyBill({
        customerId: customer.id,
        branchId: branch.id,
        createdById: admin.id,
        items: pharmacyItems,
        paymentMode: 'ONLINE',
        paidAmount: paymentStatus === 'PAID' ? 0 : 0,
        roleCode: 'SUPER_ADMIN',
      });
      if (paymentStatus === 'PAID') {
        bill = await prisma.bill.update({
          where: { id: bill.id },
          data: {
            source: 'ONLINE',
            onlineOrderId: orderNo,
            paidAmount: bill.totalAmount,
            balanceAmount: 0,
            status: 'PAID',
            payments: {
              create: { amount: bill.totalAmount, paymentMode: 'ONLINE', referenceNo: orderNo },
            },
          },
          include: { payments: true },
        });
        const { syncBillLedgers } = await import('../services/ledgerService.js');
        await syncBillLedgers(bill.id, admin.id).catch(() => {});
      } else {
        bill = await prisma.bill.update({
          where: { id: bill.id },
          data: { source: 'ONLINE', onlineOrderId: orderNo },
          include: { payments: true },
        });
      }
    } else {
      let subtotal = 0;
      let taxAmount = 0;
      const billItems = items.map((item) => {
        const lineSubtotal = item.quantity * item.unitPrice - (item.discount || 0);
        const lineTax = lineSubtotal * ((item.taxRate || 18) / 100);
        subtotal += lineSubtotal;
        taxAmount += lineTax;
        return {
          itemType: item.type || 'PRODUCT',
          itemCode: item.sku || item.code,
          itemName: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          taxRate: item.taxRate || 18,
          taxAmount: lineTax,
          totalAmount: lineSubtotal + lineTax,
        };
      });

      const totalAmount = subtotal + taxAmount;
      const billNo = await generateNumber('BILL', 'bill', 'billNo');
      bill = await prisma.bill.create({
        data: {
          billNo,
          customerId: customer.id,
          branchId: branch.id,
          createdById: admin.id,
          subtotal,
          taxAmount,
          totalAmount,
          paidAmount: paymentStatus === 'PAID' ? totalAmount : 0,
          balanceAmount: paymentStatus === 'PAID' ? 0 : totalAmount,
          status: paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
          paymentMode: 'ONLINE',
          source: 'ONLINE',
          onlineOrderId: orderNo,
          items: { create: billItems },
          ...(paymentStatus === 'PAID'
            ? { payments: { create: { amount: totalAmount, paymentMode: 'ONLINE', referenceNo: orderNo } } }
            : {}),
        },
        include: { payments: true },
      });
      const { syncBillLedgers } = await import('../services/ledgerService.js');
      await syncBillLedgers(bill.id, admin.id).catch(() => {});
    }

    const { notifyBillWorkflow } = await import('../services/workflowOrchestrationService.js');
    const fullBill = await prisma.bill.findUnique({
      where: { id: bill.id },
      include: { payments: true },
    });
    await notifyBillWorkflow({ bill: fullBill, userId: admin.id });

    await prisma.onlineOrder.upsert({
      where: { orderNo },
      create: {
        orderNo,
        customerName,
        customerEmail,
        customerPhone,
        items: JSON.stringify(items),
        subtotal: bill.subtotal,
        taxAmount: bill.taxAmount,
        totalAmount: bill.totalAmount,
        paymentStatus: paymentStatus || 'PAID',
        status: 'INVOICED',
        billId: bill.id,
      },
      update: { status: 'INVOICED', billId: bill.id },
    });

    res.json({
      success: true,
      data: {
        orderNo,
        billId: bill.id,
        billNo: bill.billNo,
        totalAmount: bill.totalAmount,
        status: 'INVOICED',
      },
    });
  } catch (err) {
    console.error(err);
    await prisma.onlineOrder.upsert({
      where: { orderNo: req.body.orderNo },
      create: {
        orderNo: req.body.orderNo,
        customerName: req.body.customerName || '',
        customerPhone: req.body.customerPhone || '',
        items: JSON.stringify(req.body.items || []),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        status: 'FAILED',
        errorMessage: err.message,
      },
      update: { status: 'FAILED', errorMessage: err.message },
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/online-orders/:orderNo', requireApiKey, async (req, res) => {
  const order = await prisma.onlineOrder.findUnique({ where: { orderNo: req.params.orderNo } });
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  const bill = order.billId ? await prisma.bill.findUnique({
    where: { id: order.billId },
    select: { id: true, billNo: true, status: true, totalAmount: true },
  }) : null;
  res.json({ success: true, data: { ...order, bill } });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VCare ERP API', timestamp: new Date().toISOString() });
});

export default router;
