import { prisma } from '../lib/prisma.js';
import { getConsultantIncentiveReport } from './incentiveService.js';

export async function processIncentiveUpload(uploadId) {
  const upload = await prisma.incentiveUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw new Error('Incentive upload record not found');

  const report = await getConsultantIncentiveReport(upload.periodMonth, upload.periodYear);
  const procedureCount = report.length;
  const totalIncentive = report.reduce((sum, r) => sum + (r.incentive || 0), 0);

  await prisma.incentiveUpload.update({
    where: { id: uploadId },
    data: {
      status: 'CALCULATED',
      totalAmount: totalIncentive,
      notes: `${upload.notes || ''}\n[Processed] ${procedureCount} lines, total ₹${totalIncentive.toFixed(2)}`.trim(),
      filePath: upload.filePath || `calculated-${upload.periodMonth}-${upload.periodYear}.json`,
    },
  });

  return { procedureCount, totalIncentive, report };
}
