import { prisma } from '../lib/prisma.js';
import { startOfDay, endOfDay, subDays } from '../utils/dateHelpers.js';
import { getPendingScheduleCustomers } from './schedulePendingService.js';
import { getTreatmentPlanProgress } from './treatmentPlanService.js';

function task(priority, title, description, url, meta = {}) {
  return { priority, title, description, url, ...meta };
}

function section(title, tasks, icon = 'clipboard-list') {
  const filtered = tasks.filter(Boolean);
  if (!filtered.length) return null;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return { title, icon, slug, tasks: filtered };
}

async function pendingFollowUps(branchFilter, limit = 15) {
  return prisma.followUp.findMany({
    where: {
      status: 'PENDING',
      ...(branchFilter.branchId ? { customer: { branchId: branchFilter.branchId } } : {}),
    },
    include: { customer: true },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });
}

async function todayAppointments(branchFilter, consultantId = null, limit = 15) {
  const today = new Date();
  return prisma.appointment.findMany({
    where: {
      ...branchFilter,
      scheduledAt: { gte: startOfDay(today), lte: endOfDay(today) },
      ...(consultantId ? { consultantId } : {}),
      status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
    },
    include: { customer: true, consultant: true },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });
}

async function sessionsDueTasks(branchCustomer, performerId = null, limit = 10) {
  const activeSlips = await prisma.treatmentSlip.findMany({
    where: { status: 'ACTIVE', customer: branchCustomer },
    include: {
      customer: true,
      procedures: {
        where: { status: { not: 'CANCELLED' }, sessionNo: { not: null } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2,
  });

  const tasks = [];
  for (const slip of activeSlips) {
    if (performerId) {
      const performerLinked = slip.procedures.some((p) => p.performerId === performerId);
      if (slip.procedures.length > 0 && !performerLinked) continue;
    }

    let progress;
    try {
      progress = await getTreatmentPlanProgress(slip.id);
    } catch {
      continue;
    }
    if (!progress.nextSessionNo || progress.remaining <= 0) continue;

    const now = new Date();
    if (slip.nextSessionDueAt && new Date(slip.nextSessionDueAt) > now) continue;

    const bookedForNext = slip.procedures.some(
      (p) => p.sessionNo === progress.nextSessionNo
        && ['BOOKED', 'SCHEDULED', 'IN_PROGRESS'].includes(p.status),
    );
    if (bookedForNext) continue;

    tasks.push(task(
      'high',
      `Session ${progress.nextSessionNo} of ${progress.totalSessions} due`,
      `${slip.customer.firstName} ${slip.customer.lastName} · ${slip.slipNo}${slip.nextSessionDueAt ? ' · due ' + new Date(slip.nextSessionDueAt).toLocaleDateString() : ''}`,
      `/call-center/follow-ups/next-sitting?customerId=${slip.customerId}`,
      { entityType: 'customer', entityId: slip.customerId, actionLabel: 'Book session' },
    ));
    if (tasks.length >= limit) break;
  }
  return tasks;
}

export async function getRoleTaskQueue(user, branchFilter = {}) {
  const role = user.roleCode;
  const sections = [];
  const today = new Date();
  const yesterday = subDays(today, 1);

  if (role === 'CALL_CENTER' || role === 'SUPER_ADMIN') {
    const fus = await pendingFollowUps(branchFilter);
    const leads = await prisma.customer.count({
      where: { ...branchFilter, appointments: { none: {} }, createdAt: { gte: subDays(today, 7) } },
    });
    const s = section('Call Center Queue', [
      ...fus.map((f) => task('high', `Follow-up: ${f.customer.firstName}`, f.type, `/call-center/follow-ups?followUpId=${f.id}`, {
        entityType: 'followUp', entityId: f.id, actionLabel: 'Complete',
      })),
      leads > 0 ? task('medium', `${leads} new leads without appointment`, 'Book from schedule pending', '/customer/schedule-pending') : null,
      task('low', 'Dialer', 'Lookup → book → clinical workflow', '/call-center/dialer'),
      task('low', 'Treatment booked', 'View and confirm slots', '/call-center/treatment-booked'),
      task('low', 'Lead upload', 'Bulk import leads', '/registry/forms/lead-upload'),
    ], 'phone');
    if (s) sections.push(s);
  }

  if (role === 'CONSULTANT' || role === 'THERAPIST' || role === 'SUPER_ADMIN') {
    const scopedPerformer = role === 'CONSULTANT' || role === 'THERAPIST';
    const performerFilter = scopedPerformer ? { performerId: user.id } : {};
    const branchCustomer = branchFilter.branchId ? { branchId: branchFilter.branchId } : {};

    const [appts, procedures, unbilled, noConsent, inProgressProcs, schedulePending, consumptionMasters, sessionDue] = await Promise.all([
      todayAppointments(branchFilter, scopedPerformer ? user.id : null),
      prisma.procedure.findMany({
        where: {
          status: { in: ['BOOKED', 'SCHEDULED', 'IN_PROGRESS'] },
          ...performerFilter,
          customer: branchCustomer,
        },
        include: { customer: true },
        take: 12,
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.procedure.findMany({
        where: {
          status: 'COMPLETED',
          billId: null,
          ...performerFilter,
          customer: branchCustomer,
        },
        include: { customer: true },
        take: 10,
      }),
      prisma.procedure.findMany({
        where: {
          consentGiven: false,
          status: { in: ['BOOKED', 'SCHEDULED', 'IN_PROGRESS'] },
          ...performerFilter,
          customer: branchCustomer,
        },
        include: { customer: true },
        take: 10,
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.procedure.findMany({
        where: {
          status: 'IN_PROGRESS',
          ...performerFilter,
          customer: branchCustomer,
        },
        include: { customer: true, treatment: true },
        take: 15,
      }),
      getPendingScheduleCustomers(branchFilter),
      prisma.procedureConsumption.findMany({ where: { isActive: true } }),
      sessionsDueTasks(branchCustomer, scopedPerformer ? user.id : null),
    ]);

    const typesWithMaster = new Set(consumptionMasters.map((m) => m.procedureType));
    const inProgressIds = inProgressProcs.map((p) => p.id);
    const consumedIds = new Set(
      inProgressIds.length
        ? (await prisma.clinicalConsumption.findMany({
            where: { procedureId: { in: inProgressIds } },
            select: { procedureId: true },
          })).map((c) => c.procedureId)
        : [],
    );
    const needsConsumption = inProgressProcs.filter((p) => {
      const procType = p.treatment?.code;
      return procType && typesWithMaster.has(procType) && !consumedIds.has(p.id);
    });

    const s = section('Clinical Workflow', [
      ...sessionDue,
      ...schedulePending.slice(0, 8).map((c) => {
        const pendingCount = c.scheduleSteps.filter((st) => st.status === 'PENDING').length;
        return task('high', `Schedule pending: ${c.firstName}`, `${pendingCount} step(s) incomplete`, `/customer/schedule-pending/${c.id}`, {
          entityType: 'customer', entityId: c.id, actionLabel: 'Continue workflow',
        });
      }),
      ...appts.map((a) => task('high', `Appt ${a.appointmentNo}`, `${a.customer.firstName} · ${a.scheduledAt.toLocaleTimeString()}`, `/appointments/${a.id}`, {
        entityType: 'appointment', entityId: a.id,
      })),
      ...noConsent.map((p) => task('urgent', `Consent missing: ${p.procedureNo}`, p.customer.firstName, `/appointments/procedures/${p.id}`, {
        entityType: 'procedure', entityId: p.id, actionLabel: 'Capture consent',
      })),
      ...needsConsumption.map((p) => task('high', `Apply consumption: ${p.procedureNo}`, `${p.customer.firstName} · ${p.treatment?.name || 'Procedure'}`, `/inventory/clinical-consumption?procedureId=${p.id}&customerId=${p.customerId}`, {
        entityType: 'procedure', entityId: p.id, actionLabel: 'Record consumption',
      })),
      ...procedures.map((p) => task('high', `Procedure ${p.procedureNo}`, `${p.customer.firstName} · ${p.status}`, `/appointments/procedures/${p.id}`, {
        entityType: 'procedure', entityId: p.id, actionLabel: 'Open',
      })),
      ...unbilled.map((p) => task('urgent', `Bill pending: ${p.procedureNo}`, p.customer.firstName, `/clinical/workflow/${p.customerId}`, {
        entityType: 'procedure', entityId: p.id, actionLabel: 'Clinical Flow',
      })),
      ...(unbilled[0] ? [task('medium', 'Clinical workflow', 'Guided consult → procedure → bill', `/clinical/workflow/${unbilled[0].customerId}`)] : []),
      schedulePending.length > 8 ? task('medium', `${schedulePending.length - 8} more schedule workflows`, 'View all pending', '/customer/schedule-pending') : null,
      task('medium', 'Consultations', 'Open consultation queue', '/customer/consultations'),
    ], 'stethoscope');
    if (s) sections.push(s);
  }

  if (role === 'BRANCH_MANAGER' || role === 'SUPER_ADMIN') {
    const [petty, indents, outward, yesterdayClose, workOrders] = await Promise.all([
      prisma.pettyCash.count({ where: { ...branchFilter, status: 'PENDING' } }),
      prisma.indent.count({ where: { ...branchFilter, status: 'PENDING' } }),
      prisma.stockOutward.count({ where: { ...branchFilter, status: 'PENDING' } }),
      prisma.dayClose.findFirst({
        where: {
          ...branchFilter,
          closeDate: { gte: startOfDay(yesterday), lte: endOfDay(yesterday) },
        },
      }),
      prisma.workOrder.count({ where: { ...branchFilter, status: 'PENDING_AUTH' } }),
    ]);
    const needsDayClose = !yesterdayClose || ['DRAFT', 'SUBMITTED'].includes(yesterdayClose.status);
    const s = section('Branch Operations', [
      petty > 0 ? task('high', `${petty} petty cash approvals`, 'Review and approve', '/operations/petty-cash') : null,
      indents > 0 ? task('high', `${indents} stock indents`, 'Authorize fulfillment', '/inventory/indents/authorize') : null,
      workOrders > 0 ? task('high', `${workOrders} work orders`, 'Authorize pending WOs', '/purchase/work-orders/authorize') : null,
      outward > 0 ? task('medium', `${outward} stock outward`, 'Authorize dispatch', '/inventory/stock-outward') : null,
      needsDayClose ? task('urgent', 'Day close pending', `Close ${yesterday.toLocaleDateString()}`, '/finance/day-close') : null,
      task('medium', 'Branch manager portal', 'KPIs and tickets', '/portal/branch-manager'),
    ], 'building');
    if (s) sections.push(s);
  }

  if (role === 'ACCOUNTS' || role === 'SUPER_ADMIN') {
    const [outstanding, emis, incentives, submittedClose, procCompletedFu] = await Promise.all([
      prisma.bill.count({ where: { ...branchFilter, balanceAmount: { gt: 0 }, status: { in: ['PENDING', 'PARTIAL'] } } }),
      prisma.loanInstallment.count({ where: { status: 'PENDING', dueDate: { lte: today } } }),
      prisma.incentiveUpload.count({ where: { status: { in: ['CALCULATED', 'PENDING'] } } }),
      prisma.dayClose.count({ where: { ...branchFilter, status: 'SUBMITTED' } }),
      prisma.followUp.count({
        where: {
          type: 'PROCEDURE_COMPLETED',
          status: 'PENDING',
          ...(branchFilter.branchId ? { customer: { branchId: branchFilter.branchId } } : {}),
        },
      }),
    ]);
    const topAr = await prisma.bill.findMany({
      where: { ...branchFilter, balanceAmount: { gt: 0 }, status: { in: ['PENDING', 'PARTIAL'] } },
      include: { customer: true },
      orderBy: { billDate: 'asc' },
      take: 8,
    });
    const s = section('Finance Closure', [
      ...topAr.map((b) => task('high', `Collect ${b.billNo}`, `${b.customer.firstName} · ₹${b.balanceAmount}`, `/billing/${b.id}`, {
        entityType: 'bill', entityId: b.id, actionLabel: 'Collect',
      })),
      procCompletedFu > 0 ? task('high', `${procCompletedFu} procedures awaiting bill`, 'Complete billing', '/reports/procedure-pending') : null,
      outstanding > 8 ? task('medium', `${outstanding - 8} more outstanding bills`, 'AR aging report', '/finance/ar-aging') : null,
      emis > 0 ? task('high', `${emis} overdue EMIs`, 'Process installment payments', '/billing/loans') : null,
      incentives > 0 ? task('medium', `${incentives} incentive batches`, 'Calculate and approve payouts', '/finance/incentives') : null,
      submittedClose > 0 ? task('urgent', `${submittedClose} day-close submissions`, 'Approve branch close', '/finance/day-close') : null,
      task('low', 'Advance audit', 'Applied advance trail', '/finance/advance-audit'),
      task('low', 'Finance hub', 'Reconciliation & GST', '/finance'),
      task('low', 'Accounts portal', 'Collections queue', '/portal/accounts'),
    ], 'wallet');
    if (s) sections.push(s);
  }

  if (role === 'WAREHOUSE' || role === 'SUPER_ADMIN') {
    const [indents, transfers, grnQc, workOrders] = await Promise.all([
      prisma.indent.count({ where: { status: { in: ['PENDING', 'APPROVED'] } } }),
      prisma.stockTransfer.count({ where: { status: 'PENDING' } }),
      prisma.gRN.count({ where: { status: 'RECEIVED' } }),
      prisma.workOrder.count({ where: { status: 'PENDING_AUTH' } }),
    ]);
    const s = section('Supply Chain', [
      indents > 0 ? task('high', `${indents} indents to fulfill`, 'Dispatch stock', '/warehouse/dispatch') : null,
      transfers > 0 ? task('medium', `${transfers} transfer approvals`, 'Approve inter-branch', '/warehouse/dispatch') : null,
      workOrders > 0 ? task('high', `${workOrders} work orders pending`, 'Authorize at purchase', '/purchase/work-orders/authorize') : null,
      grnQc > 0 ? task('medium', `${grnQc} GRN QC pending`, 'Quality check inward', '/purchase/grn') : null,
      task('medium', 'Kit shortfall', 'Warehouse kit gaps', '/inventory/kit-shortfall'),
      task('low', 'Warehouse portal', 'Stock overview', '/portal/warehouse'),
    ], 'package');
    if (s) sections.push(s);
  }

  if (role === 'PHARMACIST' || role === 'SUPER_ADMIN') {
    const { getLowStockByReorder, getUpcomingProcedureShortfalls } = await import('./kitShortfallService.js');
    const lowStock = (await getLowStockByReorder(branchFilter)).length;
    const procShortfalls = await getUpcomingProcedureShortfalls(branchFilter, 10);
    const pharmacyBills = await prisma.bill.findMany({
      where: {
        billType: 'PHARMACY',
        balanceAmount: { gt: 0 },
        status: { in: ['PENDING', 'PARTIAL'] },
        ...branchFilter,
        pharmacyProcedure: { isNot: null },
      },
      include: { customer: true, pharmacyProcedure: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const s = section('Pharmacy', [
      ...pharmacyBills.map((b) => task(
        'high',
        `Procedure pharmacy: ${b.billNo}`,
        `${b.customer.firstName} · ${b.pharmacyProcedure?.procedureNo || '—'}`,
        `/billing/${b.id}`,
        { entityType: 'bill', entityId: b.id, actionLabel: 'Dispense & bill' },
      )),
      lowStock > 0 ? task('medium', `${lowStock} SKUs below reorder`, 'Raise indent', '/inventory/indents/create?type=BILLABLE') : null,
      ...procShortfalls.slice(0, 5).map((ps) => task(
        'high',
        `Kit shortfall: ${ps.procedure.procedureNo}`,
        ps.shortfalls.map((x) => x.productName).join(', '),
        `/inventory/kit-shortfall?procedureId=${ps.procedure.id}`,
      )),
      task('medium', 'Kit shortfall dashboard', 'View all kit gaps', '/inventory/kit-shortfall'),
      task('medium', 'Pharmacy billing', 'B2B / retail bills', '/billing/pharmacy'),
      task('low', 'Products', 'SKU master', '/inventory/products'),
    ], 'pill');
    if (s) sections.push(s);
  }

  if (role === 'CORPORATE' || role === 'SUPER_ADMIN') {
    const [ious, tickets] = await Promise.all([
      prisma.iOURequest.count({ where: { status: 'PENDING' } }),
      prisma.ticket.count({ where: { status: 'OPEN' } }),
    ]);
    const s = section('Corporate', [
      ious > 0 ? task('high', `${ious} IOU approvals`, 'Review requests', '/operations/iou/approve') : null,
      tickets > 0 ? task('medium', `${tickets} open tickets`, 'Support queue', '/operations/tickets') : null,
      task('low', 'Corporate portal', 'Executive view', '/portal/corporate'),
    ], 'briefcase');
    if (s) sections.push(s);
  }

  const built = sections.filter(Boolean);
  const summary = {
    urgent: built.reduce((n, s) => n + s.tasks.filter((t) => t.priority === 'urgent').length, 0),
    high: built.reduce((n, s) => n + s.tasks.filter((t) => t.priority === 'high').length, 0),
    medium: built.reduce((n, s) => n + s.tasks.filter((t) => t.priority === 'medium').length, 0),
    low: built.reduce((n, s) => n + s.tasks.filter((t) => t.priority === 'low').length, 0),
  };
  const totalTasks = built.reduce((n, s) => n + s.tasks.length, 0);
  return { sections: built, totalTasks, summary, role, generatedAt: new Date() };
}

export async function getTaskCounts(user, branchFilter = {}) {
  const { totalTasks } = await getRoleTaskQueue(user, branchFilter);
  return totalTasks;
}
