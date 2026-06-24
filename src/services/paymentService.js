import { prisma } from '../lib/prisma.js';
import { assertDateNotLocked } from './financeDayLockService.js';
import { postPaymentJournal } from './ledgerService.js';
import { onPaymentRecorded } from './workflowOrchestrationService.js';

export async function recordPayment({
  billId,
  amount,
  paymentMode,
  referenceNo,
  notes,
  userId,
  skipDateLock = false,
}) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');
  if (!skipDateLock) {
    await assertDateNotLocked(bill.branchId, new Date(), 'record payments');
  }

  const newPaid = bill.paidAmount + amount;
  const balanceAmount = bill.totalAmount - newPaid;
  const status = newPaid >= bill.totalAmount ? 'PAID' : 'PARTIAL';

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        billId,
        amount,
        paymentMode,
        referenceNo,
        notes,
      },
    });

    const updatedBill = await tx.bill.update({
      where: { id: billId },
      data: { paidAmount: newPaid, balanceAmount, status },
    });

    await postPaymentJournal({ payment, bill: updatedBill, createdById: userId, tx }).catch(() => {});

    await onPaymentRecorded({ bill: updatedBill, payment, userId });

    return { payment, bill: updatedBill };
  });
}
