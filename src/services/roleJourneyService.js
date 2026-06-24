import { prisma } from '../lib/prisma.js';
import { CLINICAL_STEPS } from './clinicalWorkflowService.js';
import { SCHEDULE_STEPS } from './schedulePendingService.js';

const SCHEDULE_WORKFLOW_STEP = {
  key: 'SCHEDULE_WORKFLOW',
  label: 'Schedule Workflow',
};

const JOURNEY_STEPS = [
  ...CLINICAL_STEPS.slice(0, 2),
  SCHEDULE_WORKFLOW_STEP,
  ...CLINICAL_STEPS.slice(2),
].map((s) => ({
  key: s.key,
  label: s.label,
  path: (c, ctx = {}) => {
    const urls = {
      REGISTERED: `/customer/${c.id}`,
      APPOINTMENT: `/appointments/create?customerId=${c.id}`,
      SCHEDULE_WORKFLOW: `/customer/schedule-pending/${c.id}`,
      CONSULTATION: `/clinical/workflow/${c.id}#consultation`,
      PROCEDURE: ctx.activeProcedure
        ? `/appointments/procedures/${ctx.activeProcedure.id}`
        : `/appointments/procedures/book?customerId=${c.id}`,
      BILLING: ctx.activeProcedure && !ctx.activeProcedure.billId
        ? `/billing/create?customerId=${c.id}&procedureId=${ctx.activeProcedure.id}`
        : `/billing/create?customerId=${c.id}`,
      PAYMENT: ctx.latestBill ? `/billing/${ctx.latestBill.id}` : `/billing/create?customerId=${c.id}`,
    };
    return urls[s.key];
  },
}));

function scheduleWorkflowDone(scheduleSteps) {
  if (!scheduleSteps.length) return false;
  return SCHEDULE_STEPS.every((step) =>
    scheduleSteps.some((s) => s.step === step && s.status === 'COMPLETED'),
  );
}

export async function getCustomerJourney(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      appointments: { orderBy: { scheduledAt: 'desc' }, take: 1 },
      consultations: { orderBy: { createdAt: 'desc' }, take: 3 },
      procedures: { orderBy: { scheduledAt: 'desc' }, take: 3, include: { bill: true } },
      bills: { orderBy: { billDate: 'desc' }, take: 1 },
      scheduleSteps: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!customer) return null;

  const activeProcedure = customer.procedures.find((p) => p.status !== 'CANCELLED' && !p.billId) || null;
  const latestBill = customer.bills[0];
  const ctx = { activeProcedure, latestBill };

  const completed = new Set(['REGISTERED']);
  const pending = [];

  if (customer.appointments.length) completed.add('APPOINTMENT');
  else pending.push('APPOINTMENT');

  if (customer.appointments.length) {
    if (scheduleWorkflowDone(customer.scheduleSteps)) {
      completed.add('SCHEDULE_WORKFLOW');
    } else if (customer.scheduleSteps.some((s) => s.status === 'PENDING') || customer.scheduleSteps.length === 0) {
      pending.push('SCHEDULE_WORKFLOW');
    }
  }

  if (customer.consultations.some((c) => c.status === 'COMPLETED')) {
    completed.add('CONSULTATION');
  } else if (completed.has('SCHEDULE_WORKFLOW')) {
    pending.push('CONSULTATION');
  } else if (customer.appointments.length && pending[0] !== 'SCHEDULE_WORKFLOW') {
    pending.push('CONSULTATION');
  }

  if (customer.procedures.some((p) => p.status === 'COMPLETED' || p.billId)) {
    completed.add('PROCEDURE');
  } else if (completed.has('CONSULTATION')) {
    pending.push('PROCEDURE');
  }

  if (latestBill) {
    completed.add('BILLING');
    if (latestBill.balanceAmount <= 0 || latestBill.status === 'PAID') completed.add('PAYMENT');
    else pending.push('PAYMENT');
  } else if (customer.procedures.some((p) => p.status === 'COMPLETED' || p.billId)) {
    pending.push('BILLING');
  }

  const steps = JOURNEY_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    done: completed.has(s.key),
    current: pending[0] === s.key,
    url: s.path(customer, ctx),
  }));

  const nextStep = pending[0]
    ? steps.find((s) => s.key === pending[0])
    : steps.find((s) => !s.done);

  return {
    customer: {
      id: customer.id,
      name: `${customer.firstName} ${customer.lastName}`,
      uhid: customer.uhid,
      phone: customer.phone,
    },
    steps,
    nextStep,
    progress: Math.round((steps.filter((s) => s.done).length / steps.length) * 100),
  };
}

export function getRoleJourneyGuide(roleCode) {
  const guides = {
    CALL_CENTER: {
      title: 'Lead → Appointment Journey',
      chain: [
        { label: 'Dialer', url: '/call-center/dialer' },
        { label: 'Register / find lead', url: '/customer/register' },
        { label: 'Schedule pending workflow', url: '/customer/schedule-pending' },
        { label: 'Book appointment', url: '/appointments/create' },
        { label: 'Follow-up queue', url: '/call-center/follow-ups' },
      ],
    },
    CONSULTANT: {
      title: 'Consult → Procedure → Bill',
      chain: [
        { label: 'My Tasks', url: '/dashboard/my-tasks' },
        { label: 'Today\'s appointments', url: '/appointments' },
        { label: 'Schedule workflow', url: '/customer/schedule-pending' },
        { label: 'Clinical workflow', url: '/dashboard/my-tasks' },
        { label: 'Consultation', url: '/customer/consultations' },
        { label: 'Book procedure', url: '/appointments/procedures/book' },
        { label: 'Create bill', url: '/billing/create' },
      ],
    },
    THERAPIST: {
      title: 'Procedure & Consumption',
      chain: [
        { label: 'My Tasks', url: '/dashboard/my-tasks' },
        { label: 'Procedures', url: '/appointments/procedures' },
        { label: 'Clinical consumption', url: '/inventory/clinical-consumption' },
        { label: 'Schedule workflow', url: '/customer/schedule-pending' },
      ],
    },
    BRANCH_MANAGER: {
      title: 'Branch Day Operations',
      chain: [
        { label: 'My tasks', url: '/dashboard/my-tasks' },
        { label: 'Approve indents & outward', url: '/inventory/indents' },
        { label: 'Day sales review', url: '/dashboard/day-sales' },
        { label: 'Day close wizard', url: '/finance/day-close' },
      ],
    },
    ACCOUNTS: {
      title: 'Finance Close Loop',
      chain: [
        { label: 'Collections queue', url: '/portal/accounts' },
        { label: 'AR aging', url: '/finance/ar-aging' },
        { label: 'Incentive payouts', url: '/finance/incentives' },
        { label: 'Approve day close', url: '/finance/day-close' },
        { label: 'GST export', url: '/finance/gst-export' },
      ],
    },
    WAREHOUSE: {
      title: 'Supply Loop',
      chain: [
        { label: 'Pending indents', url: '/inventory/indents' },
        { label: 'GRN & QC', url: '/purchase/grn' },
        { label: 'Stock transfers', url: '/inventory/stock-transfers' },
        { label: 'Outward dispatch', url: '/inventory/stock-outward' },
      ],
    },
    PHARMACIST: {
      title: 'Pharmacy Flow',
      chain: [
        { label: 'Pharmacy bill', url: '/billing/pharmacy' },
        { label: 'B2B billing', url: '/billing/pharmacy/b2b' },
        { label: 'Stock & indent', url: '/inventory/products' },
      ],
    },
    CORPORATE: {
      title: 'Corporate Oversight',
      chain: [
        { label: 'Corporate portal', url: '/portal/corporate' },
        { label: 'IOU approvals', url: '/operations/iou' },
        { label: 'Branch performance', url: '/dashboard/branch' },
      ],
    },
    SUPER_ADMIN: {
      title: 'Full ERP Control',
      chain: [
        { label: 'My tasks (all roles)', url: '/dashboard/my-tasks' },
        { label: 'Finance hub', url: '/finance' },
        { label: 'Executive dashboard', url: '/dashboard' },
        { label: 'Audit trail', url: '/admin/audit' },
      ],
    },
  };
  return guides[roleCode] || guides.SUPER_ADMIN;
}
