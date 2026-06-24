import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';
import { getReceiptVoucherData } from './financeClosureService.js';

const BRAND = 'VCare Clinic';

function inr(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function billDocTitle(bill) {
  if (bill.status === 'CANCELLED') return 'CANCELLED — Tax Invoice';
  if (bill.source === 'B2B' || bill.buyerGstin) return 'Tax Invoice';
  if (bill.billType === 'PHARMACY') return 'Pharmacy Bill';
  if (bill.billType === 'PRODUCT') return 'Sales Invoice';
  return 'Service Bill';
}

function streamPdf(res, filename, build) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 42, size: 'A4' });
  doc.pipe(res);
  build(doc);
  doc.end();
}

function drawHeader(doc, { title, branch, docNo, docDate, subtitle }) {
  doc.fontSize(16).fillColor('#0f172a').text(BRAND, { align: 'left' });
  doc.fontSize(9).fillColor('#64748b');
  doc.text(branch?.name || 'Branch', { continued: false });
  if (branch?.address) doc.text(branch.address);
  if (branch?.phone) doc.text(`Phone: ${branch.phone}`);
  if (branch?.email) doc.text(branch.email);

  doc.moveUp(5);
  doc.fontSize(14).fillColor('#0f172a').text(title, { align: 'right' });
  if (subtitle) doc.fontSize(9).fillColor('#64748b').text(subtitle, { align: 'right' });
  doc.fontSize(9).fillColor('#334155').text(`No: ${docNo}`, { align: 'right' });
  doc.text(`Date: ${new Date(docDate).toLocaleString('en-IN')}`, { align: 'right' });

  doc.moveDown(1);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(42, doc.y).lineTo(553, doc.y).stroke();
  doc.moveDown(0.8);
}

function drawPartyBlock(doc, label, lines) {
  doc.fontSize(9).fillColor('#64748b').text(label);
  doc.fontSize(10).fillColor('#0f172a');
  for (const line of lines.filter(Boolean)) doc.text(line);
  doc.moveDown(0.5);
}

function drawItemsTable(doc, items) {
  const startX = 42;
  const cols = [28, 170, 58, 36, 58, 42, 52, 58];
  const headers = ['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Tax%', 'Tax', 'Amount'];
  let y = doc.y;

  doc.fontSize(8).fillColor('#475569');
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x, y, { width: cols[i], align: i >= 3 ? 'right' : 'left' });
    x += cols[i];
  }
  y += 14;
  doc.strokeColor('#e2e8f0').moveTo(startX, y).lineTo(553, y).stroke();
  y += 6;

  doc.fontSize(8).fillColor('#0f172a');
  items.forEach((item, idx) => {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
    const row = [
      String(idx + 1),
      item.itemName,
      item.itemCode,
      String(item.quantity),
      inr(item.unitPrice),
      `${item.taxRate || 0}%`,
      inr(item.taxAmount),
      inr(item.totalAmount),
    ];
    x = startX;
    for (let i = 0; i < row.length; i++) {
      doc.text(row[i], x, y, { width: cols[i], align: i >= 3 ? 'right' : 'left' });
      x += cols[i];
    }
    y += 14;
  });

  doc.y = y + 8;
  doc.strokeColor('#e2e8f0').moveTo(startX, doc.y).lineTo(553, doc.y).stroke();
  doc.moveDown(0.8);
}

function drawTotals(doc, bill) {
  const right = 553;
  const labelX = 380;
  doc.fontSize(9).fillColor('#334155');
  const rows = [
    ['Subtotal', inr(bill.subtotal)],
    ...(bill.discount > 0 ? [['Discount', `-${inr(bill.discount)}`]] : []),
    ['Taxable Value', inr(bill.subtotal - (bill.discount || 0))],
    ['CGST', inr((bill.taxAmount || 0) / 2)],
    ['SGST', inr((bill.taxAmount || 0) / 2)],
    ['Total Tax', inr(bill.taxAmount)],
    ['Grand Total', inr(bill.totalAmount)],
    ['Amount Paid', inr(bill.paidAmount)],
    ['Balance Due', inr(bill.balanceAmount)],
  ];

  for (const [label, value] of rows) {
    const bold = label === 'Grand Total';
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, labelX, doc.y, { width: 100, align: 'left' });
    doc.text(value, labelX + 100, doc.y - doc.currentLineHeight(), { width: right - labelX - 100, align: 'right' });
    doc.moveDown(0.35);
  }
  doc.font('Helvetica');
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#64748b').text(`Payment status: ${bill.status}${bill.paymentMode ? ` · Mode: ${bill.paymentMode}` : ''}`);
}

function drawFooter(doc, note) {
  doc.moveDown(2);
  doc.strokeColor('#e2e8f0').moveTo(42, doc.y).lineTo(553, doc.y).stroke();
  doc.moveDown(0.6);
  doc.fontSize(8).fillColor('#94a3b8').text(note || 'This is a computer-generated document.', { align: 'center' });
  doc.text('Authorized Signatory', 400, doc.y + 24, { align: 'right' });
}

export async function getBillDocumentData(billId) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      customer: true,
      branch: { include: { city: true, zone: true } },
      items: true,
      payments: { orderBy: { paymentDate: 'asc' } },
      createdBy: true,
    },
  });
  if (!bill) throw new Error('Bill not found');
  return bill;
}

export async function streamBillInvoicePdf(billId, res) {
  const bill = await getBillDocumentData(billId);
  const title = billDocTitle(bill);
  const filename = `${bill.billNo.replace(/[^\w-]/g, '_')}.pdf`;

  streamPdf(res, filename, (doc) => {
    drawHeader(doc, {
      title,
      branch: bill.branch,
      docNo: bill.billNo,
      docDate: bill.billDate,
      subtitle: bill.source === 'B2B' ? 'B2B · GST' : bill.billType,
    });

    const customerLines = [
      `${bill.customer.firstName} ${bill.customer.lastName}`,
      `UHID: ${bill.customer.uhid}`,
      bill.customer.phone ? `Phone: ${bill.customer.phone}` : null,
      bill.customer.email ? `Email: ${bill.customer.email}` : null,
      bill.buyerGstin || bill.customer.gstin ? `GSTIN: ${bill.buyerGstin || bill.customer.gstin}` : null,
      bill.poReference ? `PO Ref: ${bill.poReference}` : null,
    ];
    drawPartyBlock(doc, 'Bill To', customerLines);

    if (bill.status === 'CANCELLED') {
      doc.fontSize(28).fillColor('#ef4444').text('CANCELLED', { align: 'center' });
      doc.moveDown(0.5);
    }

    drawItemsTable(doc, bill.items);
    drawTotals(doc, bill);

    if (bill.payments.length) {
      doc.moveDown(0.8);
      doc.fontSize(9).fillColor('#64748b').text('Payments Recorded');
      doc.fontSize(8).fillColor('#334155');
      for (const p of bill.payments) {
        doc.text(`• ${new Date(p.paymentDate).toLocaleString('en-IN')} — ${inr(p.amount)} (${p.paymentMode})${p.referenceNo ? ` Ref: ${p.referenceNo}` : ''}`);
      }
    }

    drawFooter(doc, `Prepared by ${bill.createdBy?.firstName || 'Staff'} · ${BRAND}`);
  });
}

export async function streamPaymentReceiptPdf(paymentId, res) {
  const data = await getReceiptVoucherData(paymentId);
  if (!data) throw new Error('Payment not found');

  const { payment, bill, customer, branch, receiptNo } = data;
  const filename = `${receiptNo}.pdf`;

  streamPdf(res, filename, (doc) => {
    drawHeader(doc, {
      title: 'Payment Receipt',
      branch,
      docNo: receiptNo,
      docDate: payment.paymentDate,
      subtitle: `Bill ${bill.billNo}`,
    });

    drawPartyBlock(doc, 'Received From', [
      `${customer.firstName} ${customer.lastName}`,
      `UHID: ${customer.uhid}`,
      customer.phone ? `Phone: ${customer.phone}` : null,
    ]);

    doc.fontSize(11).fillColor('#0f172a').text('Payment Details', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Bill No: ${bill.billNo}`);
    doc.text(`Payment Mode: ${payment.paymentMode}`);
    if (payment.referenceNo) doc.text(`Reference: ${payment.referenceNo}`);
    doc.moveDown(0.6);
    doc.fontSize(14).fillColor('#059669').text(`Amount Received: ${inr(payment.amount)}`, { align: 'left' });
    doc.fontSize(10).fillColor('#334155').text(`Bill balance after payment: ${inr(bill.balanceAmount)}`);

    if (data.journalEntry) {
      doc.moveDown(0.8);
      doc.fontSize(9).fillColor('#64748b').text(`Ledger: ${data.journalEntry.entryNo}`);
    }

    drawFooter(doc, 'Thank you for your payment.');
  });
}

export async function streamAdvanceReceiptPdf(advanceId, res) {
  const advance = await prisma.advanceReceipt.findUnique({
    where: { id: advanceId },
    include: { customer: true, branch: true },
  });
  if (!advance) throw new Error('Advance receipt not found');

  const filename = `${advance.receiptNo}.pdf`;

  streamPdf(res, filename, (doc) => {
    drawHeader(doc, {
      title: 'Advance Receipt',
      branch: advance.branch,
      docNo: advance.receiptNo,
      docDate: advance.createdAt,
    });

    drawPartyBlock(doc, 'Customer', [
      `${advance.customer.firstName} ${advance.customer.lastName}`,
      `UHID: ${advance.customer.uhid}`,
    ]);

    doc.fontSize(10).fillColor('#334155');
    doc.text(`Amount: ${inr(advance.amount)}`);
    doc.text(`Balance: ${inr(advance.balanceAmount)}`);
    doc.text(`Mode: ${advance.paymentMode}`);
    doc.text(`Status: ${advance.status}`);
    if (advance.notes) doc.text(`Notes: ${advance.notes}`);

    drawFooter(doc);
  });
}

export async function streamDeliveryChallanPdf(challanId, res) {
  const challan = await prisma.deliveryChallan.findUnique({
    where: { id: challanId },
    include: {
      order: {
        include: {
          customer: true,
          branch: true,
          items: { include: { product: true } },
        },
      },
    },
  });
  if (!challan) throw new Error('Delivery challan not found');

  const filename = `${challan.challanNo}.pdf`;

  streamPdf(res, filename, (doc) => {
    drawHeader(doc, {
      title: 'Delivery Challan',
      branch: challan.order.branch,
      docNo: challan.challanNo,
      docDate: challan.createdAt,
      subtitle: `Order ${challan.order.orderNo}`,
    });

    drawPartyBlock(doc, 'Deliver To', [
      `${challan.order.customer.firstName} ${challan.order.customer.lastName}`,
      challan.order.customer.phone ? `Phone: ${challan.order.customer.phone}` : null,
    ]);

    doc.fontSize(9).fillColor('#64748b').text('Items');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#0f172a');
    challan.order.items.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.product.name} (${item.product.sku}) × ${item.quantity}`);
    });

    if (challan.notes) {
      doc.moveDown(0.6);
      doc.fontSize(9).fillColor('#64748b').text(`Notes: ${challan.notes}`);
    }

    doc.moveDown(2);
    doc.text('Received by: _________________________', 42);
    doc.text('Date: _________________________', 320, doc.y - 12);

    drawFooter(doc, 'Goods dispatched as per above. Not a tax invoice.');
  });
}
