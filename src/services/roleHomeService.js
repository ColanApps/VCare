import { prisma } from '../lib/prisma.js';
import { startOfDay, endOfDay, subDays } from '../utils/dateHelpers.js';
import { getFinanceHubSummary } from './financeClosureService.js';
import { getRoleTaskQueue } from './taskQueueService.js';

export async function getRoleHomeData(user, branchFilter = {}) {
  const role = user.roleCode;
  const today = new Date();
  const yesterday = subDays(today, 1);
  const kpis = [];
  const links = [];

  const queue = await getRoleTaskQueue(user, branchFilter);

  if (role === 'CALL_CENTER' || role === 'SUPER_ADMIN') {
    const [pendingFu, todayAppts, newLeads] = await Promise.all([
      prisma.followUp.count({ where: { status: 'PENDING', ...(branchFilter.branchId ? { customer: { branchId: branchFilter.branchId } } : {}) } }),
      prisma.appointment.count({ where: { ...branchFilter, scheduledAt: { gte: startOfDay(today), lte: endOfDay(today) } } }),
      prisma.customer.count({ where: { ...branchFilter, appointments: { none: {} }, createdAt: { gte: subDays(today, 7) } } }),
    ]);
    kpis.push({ label: 'Pending Follow-Ups', value: pendingFu, tone: pendingFu > 0 ? 'amber' : 'neutral' });
    kpis.push({ label: "Today's Appointments", value: todayAppts });
    kpis.push({ label: 'New Leads (7d)', value: newLeads });
    links.push({ label: 'Dialer', url: '/call-center/dialer', primary: true });
    links.push({ label: 'Follow-Up Queue', url: '/call-center/follow-ups' });
    links.push({ label: 'Schedule Pending', url: '/customer/schedule-pending' });
  }

  if (role === 'CONSULTANT' || role === 'SUPER_ADMIN') {
    const consultantId = role === 'CONSULTANT' ? user.id : null;
    const [appts, unbilled, procedures] = await Promise.all([
      prisma.appointment.count({
        where: {
          ...branchFilter,
          scheduledAt: { gte: startOfDay(today), lte: endOfDay(today) },
          ...(consultantId ? { consultantId } : {}),
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        },
      }),
      prisma.procedure.count({
        where: {
          status: 'COMPLETED',
          billId: null,
          ...(consultantId ? { performerId: consultantId } : {}),
          customer: branchFilter.branchId ? { branchId: branchFilter.branchId } : {},
        },
      }),
      prisma.procedure.count({
        where: {
          status: { in: ['BOOKED', 'IN_PROGRESS'] },
          ...(consultantId ? { performerId: consultantId } : {}),
          customer: branchFilter.branchId ? { branchId: branchFilter.branchId } : {},
        },
      }),
    ]);
    kpis.push({ label: "Today's Appointments", value: appts });
    kpis.push({ label: 'Procedures In Progress', value: procedures });
    kpis.push({ label: 'Awaiting Bill', value: unbilled, tone: unbilled > 0 ? 'urgent' : 'neutral' });
    links.push({ label: 'My Tasks', url: '/dashboard/my-tasks', primary: true });
    links.push({ label: 'Appointments', url: '/appointments' });
    links.push({ label: 'Procedure Booking', url: '/appointments/procedures/book' });
  }

  if (role === 'THERAPIST') {
    const performerId = user.id;
    const branchCustomer = branchFilter.branchId ? { branchId: branchFilter.branchId } : {};
    const [inProgress, noConsent, todayProcs] = await Promise.all([
      prisma.procedure.count({
        where: {
          status: { in: ['BOOKED', 'IN_PROGRESS'] },
          performerId,
          customer: branchCustomer,
        },
      }),
      prisma.procedure.count({
        where: {
          consentGiven: false,
          status: { in: ['BOOKED', 'IN_PROGRESS'] },
          performerId,
          customer: branchCustomer,
        },
      }),
      prisma.procedure.count({
        where: {
          scheduledAt: { gte: startOfDay(today), lte: endOfDay(today) },
          performerId,
          customer: branchCustomer,
        },
      }),
    ]);
    kpis.length = 0;
    links.length = 0;
    kpis.push({ label: "Today's Procedures", value: todayProcs });
    kpis.push({ label: 'In Progress / Booked', value: inProgress });
    kpis.push({ label: 'Awaiting Consent', value: noConsent, tone: noConsent > 0 ? 'amber' : 'neutral' });
    links.push({ label: 'My Tasks', url: '/dashboard/my-tasks', primary: true });
    links.push({ label: 'Procedures', url: '/appointments/procedures' });
    links.push({ label: 'Schedule Workflow', url: '/customer/schedule-pending' });
    links.push({ label: 'Clinical Consumption', url: '/inventory/clinical-consumption' });
  }

  if (role === 'ACCOUNTS' || role === 'SUPER_ADMIN') {
    const summary = await getFinanceHubSummary(branchFilter);
    kpis.push({ label: 'AR Outstanding', value: summary.arTotal, format: 'currency', tone: 'amber' });
    kpis.push({ label: 'Pending Day Close', value: summary.pendingDayClose || 0, tone: summary.pendingDayClose ? 'urgent' : 'neutral' });
    kpis.push({ label: "Today's Collections", value: summary.todayCollections, format: 'currency' });
    links.push({ label: 'Finance Hub', url: '/finance', primary: true });
    links.push({ label: 'Day Close', url: '/finance/day-close' });
    links.push({ label: 'Advance Audit', url: '/finance/advance-audit' });
    links.push({ label: 'Collections Portal', url: '/portal/accounts' });
  }

  if (role === 'BRANCH_MANAGER' || role === 'SUPER_ADMIN') {
    const [petty, indents, dayClose] = await Promise.all([
      prisma.pettyCash.count({ where: { ...branchFilter, status: 'PENDING' } }),
      prisma.indent.count({ where: { ...branchFilter, status: 'PENDING' } }),
      prisma.dayClose.findFirst({
        where: { ...branchFilter, closeDate: { gte: startOfDay(yesterday), lte: endOfDay(yesterday) } },
      }),
    ]);
    if (role === 'BRANCH_MANAGER') {
      kpis.length = 0;
      kpis.push({ label: 'Petty Cash Pending', value: petty });
      kpis.push({ label: 'Stock Indents', value: indents });
      kpis.push({ label: 'Yesterday Close', value: dayClose?.status || 'NOT DONE', format: dayClose ? 'text' : 'text', tone: !dayClose || dayClose.status !== 'LOCKED' ? 'urgent' : 'neutral' });
      links.length = 0;
      links.push({ label: 'Branch Portal', url: '/portal/branch-manager', primary: true });
      links.push({ label: 'Day Close', url: '/finance/day-close' });
      links.push({ label: 'Petty Cash', url: '/operations/petty-cash' });
    }
  }

  if (role === 'WAREHOUSE' || role === 'PHARMACIST' || role === 'CORPORATE') {
    if (role === 'WAREHOUSE') {
      const [indents, grn] = await Promise.all([
        prisma.indent.count({ where: { status: { in: ['PENDING', 'APPROVED'] } } }),
        prisma.gRN.count({ where: { status: 'RECEIVED' } }),
      ]);
      kpis.push({ label: 'Open Indents', value: indents });
      kpis.push({ label: 'GRN QC Pending', value: grn });
      links.push({ label: 'Warehouse Portal', url: '/portal/warehouse', primary: true });
      links.push({ label: 'Indents', url: '/inventory/indents' });
    }
    if (role === 'PHARMACIST') {
      const { getLowStockByReorder } = await import('./kitShortfallService.js');
      const lowStock = (await getLowStockByReorder(branchFilter)).length;
      kpis.push({ label: 'Low Stock SKUs', value: lowStock });
      links.push({ label: 'Pharmacy Billing', url: '/billing/pharmacy', primary: true });
      links.push({ label: 'Kit Shortfalls', url: '/inventory/kit-shortfall' });
    }
    if (role === 'CORPORATE') {
      const [ious, tickets] = await Promise.all([
        prisma.iOURequest.count({ where: { status: 'PENDING' } }),
        prisma.ticket.count({ where: { status: 'OPEN' } }),
      ]);
      kpis.push({ label: 'IOU Approvals', value: ious });
      kpis.push({ label: 'Open Tickets', value: tickets });
      links.push({ label: 'Corporate Portal', url: '/portal/corporate', primary: true });
    }
  }

  if (!links.length) {
    links.push({ label: 'Executive Dashboard', url: '/dashboard', primary: true });
    links.push({ label: 'My Tasks', url: '/dashboard/my-tasks' });
  }

  return { role, kpis, links, queue, generatedAt: new Date() };
}
