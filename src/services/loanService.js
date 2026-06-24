import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { addMonths, startOfDay } from 'date-fns';

export function calculateEmi(principal, annualRate, tenureMonths) {
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate === 0) return principal / tenureMonths;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) / (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  return Math.round(emi * 100) / 100;
}

export async function createLoanEstimate({ customerId, billId, principal, interestRate, tenureMonths, provider = 'INTERNAL', externalRefNo, providerApplicationId }) {
  const emiAmount = calculateEmi(principal, interestRate, tenureMonths);
  const totalPayable = emiAmount * tenureMonths;
  const loanNo = await generateNumber('LN', 'loanAccount', 'loanNo');
  const providerPrefix = provider === 'BAJAJ' ? 'BJ' : 'LN';
  const finalLoanNo = provider === 'BAJAJ'
    ? await generateNumber(providerPrefix, 'loanAccount', 'loanNo')
    : loanNo;

  return prisma.loanAccount.create({
    data: {
      loanNo: finalLoanNo,
      customerId,
      billId: billId || null,
      principal,
      interestRate: provider === 'BAJAJ' ? (interestRate || 0) : interestRate,
      tenureMonths,
      emiAmount,
      totalPayable,
      status: provider === 'BAJAJ' ? 'PENDING' : 'PENDING',
      provider,
      externalRefNo: externalRefNo || null,
      providerApplicationId: providerApplicationId || null,
      providerStatus: provider === 'BAJAJ' ? 'SUBMITTED' : null,
    },
  });
}

export async function approveLoan({ loanId, approvedById }) {
  const loan = await prisma.loanAccount.findUnique({ where: { id: loanId } });
  if (!loan || loan.status !== 'PENDING') throw new Error('Loan not pending approval');

  const installments = [];
  for (let i = 1; i <= loan.tenureMonths; i++) {
    installments.push({
      installmentNo: i,
      dueDate: addMonths(startOfDay(new Date()), i),
      amount: loan.emiAmount,
      status: 'PENDING',
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.loanAccount.update({
      where: { id: loanId },
      data: {
        status: 'ACTIVE',
        approvedById,
        approvedAt: new Date(),
        providerStatus: loan.provider === 'BAJAJ' ? 'APPROVED' : loan.providerStatus,
      },
    });
    await tx.loanInstallment.createMany({ data: installments.map((inst) => ({ ...inst, loanId })) });
    return tx.loanAccount.findUnique({ where: { id: loanId }, include: { installments: true } });
  });
}

export async function payInstallment({ installmentId, amount, paymentMode, referenceNo }) {
  const inst = await prisma.loanInstallment.findUnique({ where: { id: installmentId }, include: { loan: { include: { bill: true } } } });
  if (!inst) throw new Error('Installment not found');

  const newPaid = inst.paidAmount + amount;
  const status = newPaid >= inst.amount ? 'PAID' : 'PENDING';

  return prisma.$transaction(async (tx) => {
    await tx.loanInstallment.update({
      where: { id: installmentId },
      data: { paidAmount: newPaid, status, paidAt: status === 'PAID' ? new Date() : null },
    });
    const loanPaid = inst.loan.paidAmount + amount;
    await tx.loanAccount.update({
      where: { id: inst.loanId },
      data: {
        paidAmount: loanPaid,
        status: loanPaid >= inst.loan.totalPayable ? 'CLOSED' : 'ACTIVE',
      },
    });

    if (inst.loan.billId && inst.loan.bill) {
      const bill = inst.loan.bill;
      const payment = await tx.payment.create({
        data: {
          billId: bill.id,
          amount,
          paymentMode: inst.loan.provider === 'BAJAJ' ? 'BAJAJ' : (paymentMode || 'LOAN'),
          referenceNo: referenceNo || `${inst.loan.loanNo}-EMI${inst.installmentNo}`,
          notes: inst.loan.provider === 'BAJAJ' ? 'Bajaj EMI collection' : 'Installment payment',
        },
      });
      const billPaid = bill.paidAmount + amount;
      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          paidAmount: billPaid,
          balanceAmount: bill.totalAmount - billPaid,
          status: billPaid >= bill.totalAmount ? 'PAID' : 'PARTIAL',
        },
      });
      const { postPaymentJournal } = await import('./ledgerService.js');
      await postPaymentJournal({ payment, bill: updatedBill, createdById: null, tx }).catch(() => {});
      const { onPaymentRecorded } = await import('./workflowOrchestrationService.js');
      await onPaymentRecorded({ bill: updatedBill, payment, userId: null }).catch(() => {});
    }
  });
}

export async function createBillInstallmentPlan({ billId, interestRate, tenureMonths, approvedById, autoApprove = true, provider = 'INTERNAL', externalRefNo }) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { loanAccounts: true },
  });
  if (!bill) throw new Error('Bill not found');
  if (bill.balanceAmount <= 0) throw new Error('Bill has no outstanding balance');
  if (bill.status === 'CANCELLED') throw new Error('Cannot create plan for cancelled bill');
  if (bill.loanAccounts.some((l) => ['PENDING', 'ACTIVE'].includes(l.status))) {
    throw new Error('Bill already has an active installment plan');
  }

  const loan = await createLoanEstimate({
    customerId: bill.customerId,
    billId: bill.id,
    principal: bill.balanceAmount,
    interestRate: provider === 'BAJAJ' ? (interestRate || 0) : (interestRate || 12),
    tenureMonths: tenureMonths || 6,
    provider,
    externalRefNo,
  });

  if (autoApprove && approvedById) {
    await approveLoan({ loanId: loan.id, approvedById });
  }

  return prisma.loanAccount.findUnique({
    where: { id: loan.id },
    include: { installments: { orderBy: { installmentNo: 'asc' } } },
  });
}

export async function createAdvanceReceipt({ customerId, branchId, amount, paymentMode, notes, createdById }) {
  const receiptNo = await generateNumber('ADV', 'advanceReceipt', 'receiptNo');
  return prisma.advanceReceipt.create({
    data: {
      receiptNo,
      customerId,
      branchId,
      amount,
      usedAmount: 0,
      balanceAmount: amount,
      paymentMode,
      notes,
      createdById,
      status: 'ACTIVE',
    },
  });
}

export async function applyAdvanceToBill({ advanceId, billId, amount, appliedById }) {
  const [advance, bill] = await Promise.all([
    prisma.advanceReceipt.findUnique({ where: { id: advanceId } }),
    prisma.bill.findUnique({ where: { id: billId } }),
  ]);
  if (!advance || advance.balanceAmount < amount) throw new Error('Insufficient advance balance');
  if (!bill) throw new Error('Bill not found');

  const applyAmount = Math.min(amount, bill.balanceAmount, advance.balanceAmount);

  return prisma.$transaction(async (tx) => {
    await tx.advanceReceipt.update({
      where: { id: advanceId },
      data: {
        usedAmount: advance.usedAmount + applyAmount,
        balanceAmount: advance.balanceAmount - applyAmount,
        status: advance.balanceAmount - applyAmount <= 0 ? 'EXHAUSTED' : 'ACTIVE',
      },
    });
    const payment = await tx.payment.create({
      data: { billId, amount: applyAmount, paymentMode: 'ADVANCE', referenceNo: advance.receiptNo },
    });
    const newPaid = bill.paidAmount + applyAmount;
    const updatedBill = await tx.bill.update({
      where: { id: billId },
      data: {
        paidAmount: newPaid,
        balanceAmount: bill.totalAmount - newPaid,
        status: newPaid >= bill.totalAmount ? 'PAID' : 'PARTIAL',
      },
    });
    const { postPaymentJournal } = await import('./ledgerService.js');
    await postPaymentJournal({ payment, bill: updatedBill, createdById: appliedById, tx }).catch(() => {});
    const { onPaymentRecorded } = await import('./workflowOrchestrationService.js');
    await onPaymentRecorded({ bill: updatedBill, payment, userId: appliedById }).catch(() => {});
    if (appliedById) {
      await tx.advanceApplication.create({
        data: { advanceId, billId, amount: applyAmount, appliedById },
      });
    }
    return { payment, bill: updatedBill };
  });
}
