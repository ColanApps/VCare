import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';
import { uploadRoot } from '../middleware/upload.js';

function consentPdfPath(filename) {
  return path.join(uploadRoot, 'consent-forms', filename);
}

export async function generateProcedureConsentPdf(procedureId) {
  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    include: {
      customer: true,
      treatment: true,
      branch: true,
      appointment: true,
    },
  });
  if (!procedure) throw new Error('Procedure not found');

  const filename = `consent-${procedure.procedureNo}-${Date.now()}.pdf`;
  const filePath = consentPdfPath(filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text('VCare Clinic — Informed Consent', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#444');
    doc.text(`Document generated: ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(1.5);

    doc.fontSize(12).fillColor('#000');
    doc.text('Patient Details', { underline: true });
    doc.fontSize(11).fillColor('#333');
    doc.text(`Name: ${procedure.customer.firstName} ${procedure.customer.lastName}`);
    doc.text(`UHID: ${procedure.customer.uhid}`);
    doc.text(`Phone: ${procedure.customer.phone || '—'}`);
    doc.moveDown();

    doc.fontSize(12).fillColor('#000').text('Procedure Details', { underline: true });
    doc.fontSize(11).fillColor('#333');
    doc.text(`Procedure No: ${procedure.procedureNo}`);
    doc.text(`Treatment: ${procedure.treatment?.name || 'Clinical procedure'}`);
    doc.text(`Scheduled: ${new Date(procedure.scheduledAt).toLocaleString('en-IN')}`);
    doc.text(`Branch: ${procedure.branch?.name || '—'}`);
    if (procedure.sessionNo) doc.text(`Session: ${procedure.sessionNo}`);
    doc.moveDown();

    doc.fontSize(12).fillColor('#000').text('Consent Statement', { underline: true });
    doc.fontSize(10).fillColor('#333');
    const body = [
      'I hereby consent to undergo the procedure/treatment described above at VCare Clinic.',
      'I acknowledge that the nature, benefits, risks, and alternatives have been explained to me.',
      'I authorize the clinic staff to perform the procedure and to take clinical photographs as required.',
      'I understand that medicines/consumables used may be billed separately.',
      'I confirm that the information provided by me is accurate to the best of my knowledge.',
    ];
    for (const line of body) {
      doc.text(`• ${line}`, { align: 'justify' });
      doc.moveDown(0.3);
    }
    doc.moveDown(2);

    doc.text('Patient / Guardian Signature: _________________________________');
    doc.moveDown();
    doc.text('Date: _____________________');
    doc.moveDown(2);
    doc.text('Witness (Staff): _________________________________');
    doc.moveDown();
    doc.text(`Procedure Ref: ${procedure.procedureNo}`);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const publicPath = `/uploads/consent-forms/${filename}`;
  await prisma.procedure.update({
    where: { id: procedureId },
    data: {
      consentFormPath: publicPath,
      consentGiven: true,
    },
  });

  return { filePath, publicPath, filename };
}

export async function ensureProcedureConsentPdf(procedureId) {
  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
  if (!procedure) return null;
  if (procedure.consentFormPath) return { publicPath: procedure.consentFormPath, existing: true };
  return generateProcedureConsentPdf(procedureId);
}
