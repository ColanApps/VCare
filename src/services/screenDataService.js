import { prisma } from '../lib/prisma.js';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { parseReportPeriod } from '../utils/reportFilters.js';
import { getInflowSales } from './dashboardService.js';
import { getConsultantIncentiveReport } from './incentiveService.js';
import { enrichScreenData } from './registryDepthService.js';

function cols(...definitions) {
  return definitions;
}

export async function getScreenData(screen, req) {
  const branchFilter = req.branchFilter || {};
  const period = parseReportPeriod(req.query);
  const handlers = {
    procedureConsumption: async () => ({
      columns: cols(['Procedure', 'p'], ['Product', 'n'], ['Qty', 'q']),
      rows: (await prisma.procedureConsumption.findMany({ include: { product: true }, take: 200 })).map((r) => ({
        p: r.procedureType, n: r.product.name, q: r.quantity,
      })),
    }),
    consultantTargets: async () => ({
      columns: cols(['Consultant', 'c'], ['Month', 'm'], ['Target', 't'], ['Achieved', 'a']),
      rows: (await prisma.consultantTarget.findMany({ take: 100, orderBy: { createdAt: 'desc' } })).map((r) => ({
        c: r.consultantId.slice(0, 8), m: `${r.month}/${r.year}`, t: r.target, a: r.achieved,
      })),
    }),
    locationTargetDay: async () => ({
      columns: cols(['Branch', 'b'], ['Date', 'd'], ['Target', 't'], ['Achieved', 'a']),
      rows: (await prisma.locationTargetDay.findMany({ include: { branch: true }, take: 100, orderBy: { targetDate: 'desc' } })).map((r) => ({
        b: r.branch.name, d: r.targetDate, t: r.target, a: r.achieved,
      })),
    }),
    consultantTargetDay: async () => ({
      columns: cols(['Consultant', 'c'], ['Date', 'd'], ['Target', 't']),
      rows: (await prisma.consultantTargetDay.findMany({ take: 100, orderBy: { targetDate: 'desc' } })).map((r) => ({
        c: r.consultantId.slice(0, 8), d: r.targetDate, t: r.target,
      })),
    }),
    headsTargets: async () => ({
      columns: cols(['User', 'u'], ['Period', 'p'], ['Target', 't']),
      rows: (await prisma.headsTarget.findMany({ take: 100 })).map((r) => ({
        u: r.userId.slice(0, 8), p: `${r.month}/${r.year}`, t: r.target,
      })),
    }),
    ccLocationTargets: async () => ({
      columns: cols(['Branch', 'b'], ['Month', 'm'], ['Target', 't']),
      rows: (await prisma.cCLocationTarget.findMany({ include: { branch: true }, take: 100 })).map((r) => ({
        b: r.branch.name, m: `${r.month}/${r.year}`, t: r.target,
      })),
    }),
    ccAgentTargets: async () => ({
      columns: cols(['Agent', 'a'], ['Month', 'm'], ['Target', 't']),
      rows: (await prisma.cCAgentTarget.findMany({ take: 100 })).map((r) => ({
        a: r.agentId.slice(0, 8), m: `${r.month}/${r.year}`, t: r.target,
      })),
    }),
    inactiveCustomers: async () => ({
      columns: cols(['UHID', 'u'], ['Name', 'n'], ['Status', 's'], ['Branch', 'b']),
      rows: (await prisma.customer.findMany({
        where: { ...branchFilter, status: { in: ['INACTIVE', 'DISCONTINUED'] } },
        include: { branch: true }, take: 200,
      })).map((c) => ({ u: c.uhid, n: `${c.firstName} ${c.lastName}`, s: c.status, b: c.branch.name })),
    }),
    hmaStatus: async () => testStatusReport('HMA'),
    dsaStatus: async () => testStatusReport('DSA'),
    pharmacyBills: async () => billListReport({ billType: 'PHARMACY' }, branchFilter),
    serviceB2bBills: async () => billListReport({ billType: 'SERVICE', source: 'B2B' }, branchFilter),
    archivedBills: async () => billListReport({ status: { notIn: ['CANCELLED'] } }, branchFilter, 6),
    cancelledBillsMonth: async () => billListReport({
      status: 'CANCELLED',
      billDate: { gte: startOfMonth(new Date()), lte: endOfMonth(new Date()) },
    }, branchFilter),
    installmentHub: async () => ({
      columns: cols(['Loan', 'l'], ['Customer', 'c'], ['EMI', 'e'], ['Status', 's']),
      rows: (await prisma.loanAccount.findMany({
        include: { customer: true, installments: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((l) => ({
        l: l.loanNo, c: `${l.customer.firstName} ${l.customer.lastName}`, e: l.emiAmount, s: l.status,
      })),
    }),
    loanPaymentUpdate: async () => ({
      columns: cols(['Loan', 'l'], ['Installment', 'i'], ['Due', 'd'], ['Status', 's']),
      rows: (await prisma.loanInstallment.findMany({
        where: { status: 'PENDING' },
        include: { loan: { include: { customer: true } } },
        take: 100, orderBy: { dueDate: 'asc' },
      })).map((i) => ({
        l: i.loan.loanNo, i: i.installmentNo, d: i.dueDate, s: i.status,
      })),
    }),
    consultantAppointments: async () => apptReport({ ...branchFilter }, period),
    onlineAppointments: async () => apptReport({ source: 'ONLINE', ...branchFilter }, period),
    treatmentStatusReport: async () => ({
      columns: cols(['Customer', 'c'], ['Procedure', 'p'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.procedure.findMany({
        where: { scheduledAt: { gte: period.from, lte: period.to } },
        include: { customer: true }, take: 100,
      })).map((p) => ({ c: p.customer.firstName, p: p.procedureNo, s: p.status, d: p.scheduledAt })),
    }),
    performerCalendar: async () => ({
      columns: cols(['Performer', 'pf'], ['Customer', 'c'], ['Procedure', 'pr'], ['Scheduled', 'd']),
      rows: (await prisma.procedure.findMany({
        include: { customer: true },
        orderBy: { scheduledAt: 'asc' }, take: 100,
      })).map((p) => ({
        pf: p.performerId ? p.performerId.slice(0, 8) : '—', c: p.customer.firstName, pr: p.procedureNo, d: p.scheduledAt,
      })),
    }),
    procedurePending: async () => ({
      columns: cols(['Customer', 'c'], ['Procedure', 'pr'], ['Status', 's']),
      rows: (await prisma.procedure.findMany({
        where: { status: { in: ['BOOKED', 'IN_PROGRESS'] } },
        include: { customer: true }, take: 100,
      })).map((p) => ({ c: p.customer.firstName, pr: p.procedureNo, s: p.status, _id: p.id })),
    }),
    procedureBookingReport: async () => ({
      columns: cols(['Customer', 'c'], ['Procedure', 'pr'], ['Date', 'd'], ['Status', 's']),
      rows: (await prisma.procedure.findMany({
        where: { scheduledAt: { gte: period.from, lte: period.to } },
        include: { customer: true }, take: 200,
      })).map((p) => ({ c: p.customer.firstName, pr: p.procedureNo, d: p.scheduledAt, s: p.status, _id: p.id })),
    }),
    ccTreatmentAppts: async () => apptReport({ type: 'TREATMENT', ...branchFilter }, period),
    ccPendingAdvanceFu: async () => followUpReport('PENDING_ADVANCE', branchFilter),
    ccRegularApptFu: async () => followUpReport('REGULAR', branchFilter),
    ccTreatmentApptFu: async () => followUpReport('TREATMENT', branchFilter),
    ccNextSitting: async () => followUpReport('TREATMENT', branchFilter),
    ccCallsFollowup: async () => followUpReport('CALLBACK', branchFilter),
    dialerDashboard: async () => ({
      kpis: [
        { label: 'Today Appointments', value: await prisma.appointment.count({ where: { scheduledAt: { gte: startOfMonth(new Date()) } } }) },
        { label: 'Pending Follow-ups', value: await prisma.followUp.count({ where: { status: 'PENDING' } }) },
      ],
      columns: cols(['Phone', 'p'], ['Customer', 'c'], ['Branch', 'b']),
      rows: (await prisma.customer.findMany({ where: branchFilter, take: 20, orderBy: { registeredAt: 'desc' } })).map((c) => ({
        p: c.phone, c: `${c.firstName} ${c.lastName}`, b: c.branchId,
      })),
      hint: 'Use API POST /api/v1/call-center/appointments to book from dialer.',
    }),
    grnReceived: async () => ({
      columns: cols(['GRN', 'g'], ['PO', 'p'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.gRN.findMany({
        where: { status: 'ACCEPTED' },
        include: { po: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((g) => ({ g: g.grnNo, p: g.po.poNo, s: g.status, d: g.createdAt })),
    }),
    indentPendingProducts: async () => pendingIndentByType('BILLABLE'),
    woAuthorize: async () => ({
      columns: cols(['WO', 'w'], ['Branch', 'b'], ['Description', 'd'], ['Status', 's']),
      rows: (await prisma.workOrder.findMany({
        where: { status: 'PENDING_AUTH' },
        include: { branch: true }, take: 50,
      })).map((w) => ({ w: w.woNo, b: w.branch.name, d: w.description, s: w.status, _id: w.id })),
    }),
    salesOrderSearch: async () => ({
      columns: cols(['Order', 'o'], ['Customer', 'c'], ['Total', 't'], ['Status', 's']),
      rows: (await prisma.salesOrder.findMany({
        where: branchFilter.branchId ? { branchId: branchFilter.branchId } : {},
        include: { customer: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((o) => ({ o: o.orderNo, c: o.customer.firstName, t: o.totalAmount, s: o.status })),
    }),
    challanSearch: async () => ({
      columns: cols(['Challan', 'c'], ['Order', 'o'], ['Status', 's']),
      rows: (await prisma.deliveryChallan.findMany({
        include: { order: { include: { customer: true } } }, take: 100,
      })).map((c) => ({ c: c.challanNo, o: c.order.orderNo, s: c.status })),
    }),
    salesInvoices: async () => billListReport({ billType: 'PRODUCT' }, branchFilter),
    salesInvoicesB2c: async () => billListReport({ billType: 'PRODUCT', source: 'B2C' }, branchFilter),
    inwardBillable: async () => stockMovementReport('GRN_RECEIPT', 'BILLABLE', period, branchFilter),
    inwardClinical: async () => stockMovementReport('GRN_RECEIPT', 'CLINICAL', period, branchFilter),
    inwardPendingBillable: async () => pendingIndentByType('BILLABLE'),
    inwardPendingClinical: async () => pendingIndentByType('CLINICAL'),
    physicalStockSearch: async () => ({
      columns: cols(['Audit', 'a'], ['Product', 'p'], ['Variance', 'v'], ['Date', 'd']),
      rows: (await prisma.physicalStockAudit.findMany({
        include: { product: true }, take: 100, orderBy: { auditedAt: 'desc' },
      })).map((a) => ({ a: a.auditNo, p: a.product.name, v: a.variance, d: a.auditedAt })),
    }),
    assetCenterStock: async () => ({
      columns: cols(['Asset', 'a'], ['Category', 'c'], ['Branch', 'b'], ['Status', 's']),
      rows: (await prisma.asset.findMany({ include: { category: true, branch: true }, take: 100 })).map((a) => ({
        a: a.assetNo, c: a.category.name, b: a.branch?.name || 'Warehouse', s: a.status,
      })),
    }),
    assetOutward: async () => ({
      columns: cols(['Asset', 'a'], ['Type', 't'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.assetMovement.findMany({
        include: { asset: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((m) => ({ a: m.asset.assetNo, t: m.movementType, s: m.status, d: m.createdAt })),
    }),
    iouSettlement: async () => ({
      columns: cols(['IOU', 'i'], ['Requester', 'r'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.iOURequest.findMany({
        where: { status: 'APPROVED' },
        include: { requester: true }, take: 100,
      })).map((r) => ({ i: r.requestNo, r: r.requester.firstName, a: r.amount, s: r.status, _id: r.id })),
    }),
    iouPendingApproval: async () => ({
      columns: cols(['IOU', 'i'], ['Requester', 'r'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.iOURequest.findMany({
        where: { status: 'PENDING' },
        include: { requester: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((r) => ({ i: r.requestNo, r: r.requester.firstName, a: r.amount, s: r.status, _id: r.id })),
    }),
    pettyCashApproval: async () => ({
      columns: cols(['Entry', 'e'], ['Branch', 'b'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.pettyCash.findMany({
        where: { status: 'PENDING' },
        include: { branch: true }, take: 100,
      })).map((p) => ({ e: p.entryNo, b: p.branch.name, a: p.amount, s: p.status, _id: p.id })),
    }),
    reimbursementApproval: async () => ({
      columns: cols(['Claim', 'c'], ['Amount', 'a'], ['Purpose', 'p'], ['Receipt', 'f'], ['Status', 's']),
      rows: (await prisma.reimbursementClaim.findMany({
        where: { status: 'PENDING' }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((c) => ({
        c: c.claimNo,
        a: c.amount,
        p: c.purpose,
        f: c.receiptPath ? 'Attached' : '—',
        s: c.status,
        _id: c.id,
        receiptPath: c.receiptPath,
      })),
    }),
    hmaStatusOps: async () => testStatusReport('HMA'),
    itAssets: async () => ({
      columns: cols(['Asset', 'a'], ['Name', 'n'], ['Value', 'v'], ['Status', 's']),
      rows: (await prisma.asset.findMany({ include: { category: true }, take: 100 })).map((a) => ({
        a: a.assetNo, n: a.name, v: a.value, s: a.status,
      })),
    }),
    operationsIssues: async () => ({
      columns: cols(['Ticket', 't'], ['Title', 'ti'], ['Priority', 'p'], ['Status', 's']),
      rows: (await prisma.ticket.findMany({
        where: { category: { in: ['IT', 'OPERATIONS', 'FACILITY'] } },
        take: 100, orderBy: { createdAt: 'desc' },
      })).map((t) => ({ t: t.ticketNo, ti: t.title, p: t.priority, s: t.status })),
    }),
    dashboardVisits: async () => ({
      columns: cols(['Visit', 'v'], ['Customer', 'c'], ['Type', 't'], ['Date', 'd']),
      rows: (await prisma.customerVisit.findMany({
        where: branchFilter.branchId ? { branchId: branchFilter.branchId } : {},
        include: { customer: true }, take: 100, orderBy: { visitedAt: 'desc' },
      })).map((v) => ({ v: v.visitNo, c: v.customer.firstName, t: v.visitType, d: v.visitedAt })),
    }),
    branchConversion: async () => {
      const customers = await prisma.customer.count({ where: branchFilter });
      const withBills = await prisma.customer.count({ where: { ...branchFilter, bills: { some: {} } } });
      return {
        kpis: [
          { label: 'Registered', value: customers },
          { label: 'Converted', value: withBills },
          { label: 'Rate %', value: customers ? Math.round((withBills / customers) * 100) : 0 },
        ],
        columns: cols(['Metric', 'm'], ['Value', 'v']),
        rows: [{ m: 'Lead to Customer', v: `${withBills}/${customers}` }],
      };
    },
    branchAppointments: async () => ({
      kpis: [
        { label: 'Scheduled', value: await prisma.appointment.count({ where: { ...branchFilter, status: 'SCHEDULED' } }) },
        { label: 'Completed', value: await prisma.appointment.count({ where: { ...branchFilter, status: 'COMPLETED' } }) },
        { label: 'Cancelled', value: await prisma.appointment.count({ where: { ...branchFilter, status: 'CANCELLED' } }) },
      ],
      columns: cols(['Status', 's'], ['Count', 'c']),
      rows: (await prisma.appointment.groupBy({ by: ['status'], where: branchFilter, _count: true })).map((g) => ({
        s: g.status, c: g._count,
      })),
    }),
    beforeAfterAlbum: async () => ({
      columns: cols(['Customer', 'c'], ['Type', 't'], ['Caption', 'ca'], ['Date', 'd']),
      rows: (await prisma.customerPhoto.findMany({
        include: { customer: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((p) => ({ c: p.customer.firstName, t: p.type, ca: p.caption, d: p.createdAt })),
    }),
    poAuthorizationDash: async () => ({
      columns: cols(['PO', 'p'], ['Vendor', 'v'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.purchaseOrder.findMany({
        where: { status: 'PENDING_AUTH' },
        include: { vendor: true }, take: 50,
      })).map((p) => ({ p: p.poNo, v: p.vendor.name, a: p.totalAmount, s: p.status })),
    }),
    inflowHairSkin: async () => {
      const inflow = await getInflowSales(branchFilter, period.from, period.to);
      return {
        kpis: [
          { label: 'Hair Revenue', value: inflow.hair },
          { label: 'Skin Revenue', value: inflow.skin },
          { label: 'Total Inflow', value: inflow.total },
        ],
        columns: cols(['Category', 'c'], ['Revenue', 'r']),
        rows: [
          { c: 'HAIR', r: inflow.hair },
          { c: 'SKIN', r: inflow.skin },
        ],
      };
    },
    daySalesHair: async () => categoryDaySales('HAIR', period, branchFilter),
    daySalesSkin: async () => categoryDaySales('SKIN', period, branchFilter),
    rptCustomerPhotos: async () => ({
      columns: cols(['Customer', 'c'], ['Type', 't'], ['Date', 'd']),
      rows: (await prisma.customerPhoto.findMany({ include: { customer: true }, take: 200 })).map((p) => ({
        c: `${p.customer.firstName} ${p.customer.lastName}`, t: p.type, d: p.createdAt,
      })),
    }),
    rptSchedulingStatus: async () => ({
      columns: cols(['Status', 's'], ['Count', 'c']),
      rows: (await prisma.appointment.groupBy({ by: ['status'], _count: true })).map((g) => ({ s: g.status, c: g._count })),
    }),
    rptSalesComparison: async () => {
      const cur = await monthSales(0, branchFilter);
      const prev = await monthSales(1, branchFilter);
      return {
        columns: cols(['Period', 'p'], ['Revenue', 'r']),
        rows: [{ p: 'Current Month', r: cur }, { p: 'Previous Month', r: prev }],
      };
    },
    rptSlipFeedback: async () => ({
      columns: cols(['Slip', 's'], ['Customer', 'c'], ['Feedback', 'f']),
      rows: (await prisma.treatmentSlip.findMany({
        include: { customer: true }, take: 100,
      })).map((s) => ({ s: s.slipNo, c: s.customer.firstName, f: '—' })),
    }),
    rptProfileHistory: async () => ({
      columns: cols(['Customer', 'c'], ['UHID', 'u'], ['Bills', 'b'], ['Visits', 'v']),
      rows: (await prisma.customer.findMany({
        where: branchFilter, include: { _count: { select: { bills: true, visits: true } } }, take: 100,
      })).map((c) => ({ c: `${c.firstName} ${c.lastName}`, u: c.uhid, b: c._count.bills, v: c._count.visits })),
    }),
    rptSupplements: async () => productSalesReport('supplement', period, branchFilter),
    rptPrescriptions: async () => ({
      columns: cols(['Consultant', 'c'], ['Customer', 'cu'], ['Diagnosis', 'd']),
      rows: (await prisma.consultation.findMany({
        include: { consultant: true, customer: true }, take: 100, orderBy: { consultedAt: 'desc' },
      })).map((c) => ({
        c: c.consultant.firstName, cu: c.customer.firstName, d: c.diagnosis || '—',
      })),
    }),
    rptCustomerVisits: async () => ({
      columns: cols(['Visit', 'v'], ['Customer', 'c'], ['Session', 's'], ['Date', 'd']),
      rows: (await prisma.customerVisit.findMany({
        include: { customer: true }, take: 200, orderBy: { visitedAt: 'desc' },
      })).map((v) => ({ v: v.visitNo, c: v.customer.firstName, s: v.sessionNo, d: v.visitedAt })),
    }),
    rptPermanentRefunds: async () => ({
      columns: cols(['Refund', 'r'], ['Customer', 'c'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.permanentRefund.findMany({
        include: { customer: true }, take: 100,
      })).map((r) => ({ r: r.refundNo, c: r.customer.firstName, a: r.amount, s: r.status, _id: r.id })),
    }),
    rptReferred: async () => ({
      columns: cols(['Customer', 'c'], ['Source', 's'], ['Branch', 'b']),
      rows: (await prisma.customer.findMany({
        where: { leadSource: { not: null }, ...branchFilter }, include: { branch: true }, take: 200,
      })).map((c) => ({ c: `${c.firstName} ${c.lastName}`, s: c.leadSource, b: c.branch.name })),
    }),
    rptConversion: async () => {
      const total = await prisma.customer.count({ where: branchFilter });
      const converted = await prisma.customer.count({ where: { ...branchFilter, bills: { some: {} } } });
      return {
        columns: cols(['Metric', 'm'], ['Value', 'v']),
        rows: [
          { m: 'Registered', v: total },
          { m: 'With Bills', v: converted },
          { m: 'Conversion %', v: total ? Math.round((converted / total) * 100) : 0 },
        ],
      };
    },
    rptSalesSummary: async () => {
      const agg = await prisma.bill.aggregate({
        where: { billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED', 'DRAFT'] }, ...branchWhere(branchFilter) },
        _sum: { totalAmount: true, paidAmount: true }, _count: true,
      });
      return {
        columns: cols(['Metric', 'm'], ['Value', 'v']),
        rows: [
          { m: 'Bills', v: agg._count },
          { m: 'Revenue', v: agg._sum.totalAmount || 0 },
          { m: 'Collected', v: agg._sum.paidAmount || 0 },
        ],
      };
    },
    rptDaySalesConsolidated: async () => ({
      columns: cols(['Date', 'd'], ['Revenue', 'r'], ['Bills', 'b']),
      rows: await dailySalesRows(period, branchFilter),
    }),
    rptConsultantCumulative: async () => ({
      columns: cols(['Consultant', 'c'], ['Revenue', 'r'], ['Bills', 'b']),
      rows: await consultantSalesRows(period, branchFilter),
    }),
    rptProcessingFees: async () => ({
      columns: cols(['Bill', 'b'], ['Customer', 'c'], ['Total', 't']),
      rows: (await prisma.bill.findMany({
        where: { loanAccounts: { some: {} }, ...branchWhere(branchFilter) },
        include: { customer: true }, take: 100,
      })).map((b) => ({ b: b.billNo, c: b.customer.firstName, t: b.totalAmount })),
    }),
    rptTrichology: async () => ({
      columns: cols(['Test', 't'], ['Customer', 'c'], ['Findings', 'f']),
      rows: (await prisma.trichoscanTest.findMany({
        include: { customer: true }, take: 100,
      })).map((t) => ({ t: t.testNo, c: t.customer.firstName, f: t.findings || '—' })),
    }),
    rptConversionDetail: async () => ({
      columns: cols(['Customer', 'c'], ['Registered', 'r'], ['First Bill', 'b']),
      rows: (await prisma.customer.findMany({
        where: { ...branchFilter, bills: { some: {} } },
        include: { bills: { take: 1, orderBy: { billDate: 'asc' } } },
        take: 100,
      })).map((c) => ({ c: c.firstName, r: c.registeredAt, b: c.bills[0]?.billDate })),
    }),
    rptStockTransfer: async () => ({
      columns: cols(['STO', 's'], ['From', 'f'], ['To', 't'], ['Status', 'st']),
      rows: (await prisma.stockTransfer.findMany({
        include: { fromBranch: true, toBranch: true }, take: 100,
      })).map((s) => ({ s: s.transferNo, f: s.fromBranch.name, t: s.toBranch.name, st: s.status })),
    }),
    rptClosingStock: async () => ({
      columns: cols(['Product', 'p'], ['Branch', 'b'], ['Qty', 'q']),
      rows: (await prisma.stock.findMany({
        where: branchFilter.branchId ? { branchId: branchFilter.branchId } : {},
        include: { product: true, branch: true }, take: 200,
      })).map((s) => ({ p: s.product.name, b: s.branch.name, q: s.quantity })),
    }),
    rptClinicalConsumption: async () => ({
      columns: cols(['Product', 'p'], ['Branch', 'b'], ['Qty', 'q'], ['Date', 'd']),
      rows: (await prisma.clinicalConsumption.findMany({
        include: { product: true, branch: true }, take: 100, orderBy: { consumedAt: 'desc' },
      })).map((c) => ({ p: c.product.name, b: c.branch.name, q: c.quantity, d: c.consumedAt })),
    }),
    rptCcFollowup: async () => followUpReport(null, branchFilter),
    rptVisitsComparison: async () => ({
      columns: cols(['Branch', 'b'], ['Visits', 'v'], ['Appointments', 'a']),
      rows: await branchVisitsComparison(period),
    }),
    callAuditRegular: async () => ({
      columns: cols(['Audit', 'a'], ['Type', 't'], ['Score', 's'], ['Date', 'd']),
      rows: (await prisma.callAudit.findMany({ take: 100, orderBy: { auditedAt: 'desc' } })).map((a) => ({
        a: a.auditNo, t: a.callType, s: a.score, d: a.auditedAt,
      })),
    }),
    incentiveProcedures: async () => ({
      columns: cols(['Procedure', 'p'], ['Customer', 'c'], ['Status', 's']),
      rows: (await prisma.procedure.findMany({
        where: { status: 'COMPLETED' },
        include: { customer: true }, take: 100,
      })).map((p) => ({ p: p.procedureNo, c: p.customer.firstName, s: p.status })),
    }),
    incentivePackage: async () => ({
      columns: cols(['Bill', 'b'], ['Customer', 'c'], ['Total', 't']),
      rows: (await prisma.billMaintenanceLog.findMany({
        where: { action: 'UPGRADE' },
        include: { bill: { include: { customer: true } } },
        take: 100,
      })).map((l) => ({ b: l.bill.billNo, c: l.bill.customer.firstName, t: l.bill.totalAmount })),
    }),
    gstInvoiceNos: async () => ({
      columns: cols(['Bill No', 'b'], ['Date', 'd'], ['GST', 'g']),
      rows: (await prisma.bill.findMany({
        where: { billDate: { gte: period.from, lte: period.to }, taxAmount: { gt: 0 } },
        take: 200, orderBy: { billNo: 'asc' },
      })).map((b) => ({ b: b.billNo, d: b.billDate, g: b.taxAmount })),
    }),
    gstCashReceipts: async () => ({
      columns: cols(['Payment', 'p'], ['Bill', 'b'], ['Mode', 'm'], ['Amount', 'a']),
      rows: (await prisma.payment.findMany({
        where: { paymentMode: 'CASH', paymentDate: { gte: period.from, lte: period.to } },
        include: { bill: true }, take: 200,
      })).map((p) => ({ p: p.id.slice(0, 8), b: p.bill.billNo, m: p.paymentMode, a: p.amount })),
    }),
    gstDebitNotes: async () => ({
      columns: cols(['Credit Note', 'c'], ['Bill', 'b'], ['Amount', 'a']),
      rows: (await prisma.creditNote.findMany({
        where: { createdAt: { gte: period.from, lte: period.to } },
        include: { bill: true }, take: 100,
      })).map((c) => ({ c: c.creditNoteNo, b: c.bill.billNo, a: c.amount })),
    }),
    gstPurchaseHsn: async () => ({
      columns: cols(['PO', 'p'], ['Product', 'pr'], ['HSN', 'h'], ['Amount', 'a']),
      rows: (await prisma.pOItem.findMany({
        include: { product: true, po: true }, take: 200,
      })).map((i) => ({ p: i.po.poNo, pr: i.product.name, h: i.product.hsnCode, a: i.totalAmount })),
    }),
    meetingDailyStatus: async () => ({
      columns: cols(['Metric', 'm'], ['Today', 't']),
      rows: [
        { m: 'Registrations', t: await prisma.customer.count({ where: { registeredAt: { gte: startOfMonth(new Date()) } } }) },
        { m: 'Appointments', t: await prisma.appointment.count({ where: { scheduledAt: { gte: startOfMonth(new Date()) } } }) },
        { m: 'Bills', t: await prisma.bill.count({ where: { billDate: { gte: startOfMonth(new Date()) } } }) },
      ],
    }),
    meetingNewRegular: async () => meetingNewRegularReport(period, branchFilter),
    meetingFySales: async () => ({
      columns: cols(['Month', 'm'], ['Revenue', 'r']),
      rows: await fyMonthlySales(branchFilter),
    }),
    meetingAnnualConversion: async () => ({
      columns: cols(['Month', 'm'], ['Registered', 'r'], ['Converted', 'c']),
      rows: await monthlyConversionRows(branchFilter),
    }),
    meetingAnnualInflow: async () => ({
      columns: cols(['Month', 'm'], ['Inflow', 'i']),
      rows: await fyMonthlySales(branchFilter),
    }),
    warehouseTickets: async () => ({
      columns: cols(['Ticket', 't'], ['Title', 'ti'], ['Status', 's']),
      rows: (await prisma.ticket.findMany({ take: 50, orderBy: { createdAt: 'desc' } })).map((t) => ({
        t: t.ticketNo, ti: t.title, s: t.status,
      })),
    }),
    warehouseB2cInvoices: async () => billListReport({ source: 'ONLINE' }, branchFilter),
    portalBranchManager: async () => ({
      kpis: [
        { label: 'Month Sales', value: (await prisma.bill.aggregate({
          where: { billDate: { gte: startOfMonth(new Date()) }, status: { notIn: ['CANCELLED'] } },
          _sum: { totalAmount: true },
        }))._sum.totalAmount || 0 },
      ],
      columns: cols(['Branch', 'b'], ['Open Tickets', 't']),
      rows: (await prisma.branch.findMany({ where: { isActive: true }, take: 20 })).map((b) => ({
        b: b.name, t: 0,
      })),
    }),
    portalWarehouse: async () => ({
      kpis: [
        { label: 'Central Stock SKUs', value: await prisma.stock.count() },
        { label: 'Pending Indents', value: await prisma.indent.count({ where: { status: 'PENDING' } }) },
      ],
      columns: cols(['Product', 'p'], ['Qty', 'q']),
      rows: (await prisma.stock.findMany({ include: { product: true }, take: 20, orderBy: { quantity: 'desc' } })).map((s) => ({
        p: s.product.name, q: s.quantity,
      })),
    }),
    portalCorpWhStock: async () => ({
      columns: cols(['Branch', 'b'], ['Product', 'p'], ['Qty', 'q']),
      rows: (await prisma.stock.findMany({ include: { product: true, branch: true }, take: 100 })).map((s) => ({
        b: s.branch.name, p: s.product.name, q: s.quantity,
      })),
    }),
    portalConsultantPhotos: async () => ({
      columns: cols(['Customer', 'c'], ['Type', 't']),
      rows: (await prisma.customerPhoto.findMany({ include: { customer: true }, take: 50 })).map((p) => ({
        c: p.customer.firstName, t: p.type,
      })),
    }),
    portalConsultantTrichoscan: async () => ({
      columns: cols(['Test', 't'], ['Customer', 'c'], ['Findings', 'f']),
      rows: (await prisma.trichoscanTest.findMany({ include: { customer: true }, take: 50 })).map((t) => ({
        t: t.testNo, c: t.customer.firstName, f: t.findings || '—',
      })),
    }),
    portalAccountsInflow: async () => {
      const inflow = await getInflowSales({}, period.from, period.to);
      return {
        kpis: [
          { label: 'Total Inflow', value: inflow.total },
          { label: 'New Customers', value: inflow.new.count },
        ],
        columns: cols(['Segment', 's'], ['Revenue', 'r'], ['Bills', 'b']),
        rows: [
          { s: 'Existing', r: inflow.existing.revenue, b: inflow.existing.count },
          { s: 'New', r: inflow.new.revenue, b: inflow.new.count },
        ],
      };
    },
    adminNotifications: async () => ({
      columns: cols(['Channel', 'c'], ['Recipient', 'r'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.notificationLog.findMany({ take: 100, orderBy: { createdAt: 'desc' } })).map((n) => ({
        c: n.type, r: n.recipient, s: n.status, d: n.createdAt,
      })),
    }),
    adminIpTracking: async () => ({
      columns: cols(['User', 'u'], ['IP', 'i'], ['Date', 'd']),
      rows: (await prisma.userSession.findMany({
        include: { user: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((s) => ({ u: s.user.email, i: s.ipAddress, d: s.createdAt })),
    }),
    aestheticsPo: async () => ({
      columns: cols(['PO', 'p'], ['Vendor', 'v'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.purchaseOrder.findMany({
        include: { vendor: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((p) => ({ p: p.poNo, v: p.vendor.name, a: p.totalAmount, s: p.status })),
    }),
    aestheticsPoPending: async () => ({
      columns: cols(['PO', 'p'], ['Vendor', 'v'], ['Amount', 'a']),
      rows: (await prisma.purchaseOrder.findMany({
        where: { status: 'PENDING_AUTH' },
        include: { vendor: true }, take: 50,
      })).map((p) => ({ p: p.poNo, v: p.vendor.name, a: p.totalAmount })),
    }),
    aestheticsGrn: async () => ({
      columns: cols(['GRN', 'g'], ['PO', 'p'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.gRN.findMany({
        include: { po: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((g) => ({ g: g.grnNo, p: g.po.poNo, s: g.status, d: g.createdAt })),
    }),
    aestheticsInvoice: async () => billListReport({ billType: 'SERVICE' }, branchFilter),
    factoryIndentSearch: async () => ({
      columns: cols(['Indent', 'i'], ['Branch', 'b'], ['Status', 's']),
      rows: (await prisma.factoryIndent.findMany({
        include: { branch: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((f) => ({ i: f.indentNo, b: f.branch?.name || '—', s: f.status })),
    }),
    factoryInward: async () => ({
      columns: cols(['GRN', 'g'], ['PO', 'p'], ['Status', 's']),
      rows: (await prisma.gRN.findMany({
        include: { po: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((g) => ({ g: g.grnNo, p: g.po.poNo, s: g.status })),
    }),
    factoryInwardQuality: async () => ({
      columns: cols(['GRN', 'g'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.gRN.findMany({
        where: { status: 'QUALITY_CHECK' },
        take: 50, orderBy: { createdAt: 'desc' },
      })).map((g) => ({ g: g.grnNo, s: g.status, d: g.createdAt })),
    }),
    factoryInwardReport: async () => ({
      columns: cols(['GRN', 'g'], ['Received', 'r'], ['Status', 's']),
      rows: (await prisma.gRN.findMany({
        where: { status: 'ACCEPTED' },
        take: 100, orderBy: { createdAt: 'desc' },
      })).map((g) => ({ g: g.grnNo, r: g.receivedDate, s: g.status })),
    }),
    assetPoSearch: async () => ({
      columns: cols(['APO', 'a'], ['Vendor', 'v'], ['Amount', 't'], ['Status', 's']),
      rows: (await prisma.assetPurchaseOrder.findMany({
        include: { vendor: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((a) => ({ a: a.apoNo, v: a.vendor?.name || '—', t: a.totalAmount, s: a.status })),
    }),
    assetPoPending: async () => ({
      columns: cols(['APO', 'a'], ['Amount', 't'], ['Status', 's']),
      rows: (await prisma.assetPurchaseOrder.findMany({
        where: { status: 'PENDING_AUTH' }, take: 50,
      })).map((a) => ({ a: a.apoNo, t: a.totalAmount, s: a.status })),
    }),
    assetGrnOpen: async () => ({
      columns: cols(['GRN', 'g'], ['PO', 'p'], ['Status', 's']),
      rows: (await prisma.gRN.findMany({
        where: { status: { in: ['DRAFT', 'QUALITY_CHECK'] } },
        include: { po: true }, take: 50,
      })).map((g) => ({ g: g.grnNo, p: g.po.poNo, s: g.status })),
    }),
    stockOutwardSearch: async () => ({
      columns: cols(['Outward', 'o'], ['Branch', 'b'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.stockOutward.findMany({
        include: { branch: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((o) => ({ o: o.outwardNo, b: o.branch.name, s: o.status, d: o.createdAt })),
    }),
    stockOutwardPending: async () => ({
      columns: cols(['Outward', 'o'], ['Branch', 'b'], ['Status', 's']),
      rows: (await prisma.stockOutward.findMany({
        where: { status: 'PENDING_AUTH' },
        include: { branch: true }, take: 50,
      })).map((o) => ({ o: o.outwardNo, b: o.branch.name, s: o.status, _id: o.id })),
    }),
    warehouseTransfer: async () => ({
      columns: cols(['Transfer', 't'], ['From', 'f'], ['To', 'to'], ['Status', 's']),
      rows: (await prisma.stockTransfer.findMany({
        where: { fromBranch: { type: 'WAREHOUSE' }, toBranch: { type: 'WAREHOUSE' } },
        include: { fromBranch: true, toBranch: true }, take: 100,
      })).map((s) => ({ t: s.transferNo, f: s.fromBranch.name, to: s.toBranch.name, s: s.status })),
    }),
    stockAnalysis: async () => ({
      columns: cols(['Product', 'p'], ['Branch', 'b'], ['Qty', 'q'], ['Value', 'v']),
      rows: (await prisma.stock.findMany({
        include: { product: true, branch: true }, take: 200, orderBy: { quantity: 'desc' },
      })).map((s) => ({ p: s.product.name, b: s.branch.name, q: s.quantity, v: s.quantity * (s.product.unitPrice || 0) })),
    }),
    consolidatedStock: async () => ({
      columns: cols(['Product', 'p'], ['Total Qty', 'q']),
      rows: Object.entries(
        (await prisma.stock.findMany({ include: { product: true } })).reduce((acc, s) => {
          acc[s.product.name] = (acc[s.product.name] || 0) + s.quantity;
          return acc;
        }, {}),
      ).map(([p, q]) => ({ p, q })),
    }),
    uhidMapping: async () => ({
      columns: cols(['UHID', 'u'], ['Customer', 'c'], ['Phone', 'p']),
      rows: (await prisma.customer.findMany({ where: branchFilter, take: 100 })).map((c) => ({
        u: c.uhid, c: `${c.firstName} ${c.lastName}`, p: c.phone,
      })),
    }),
    newLead: async () => ({
      columns: cols(['Customer', 'c'], ['Phone', 'p'], ['Registered', 'd'], ['Status', 's']),
      rows: (await prisma.customer.findMany({
        where: { ...branchFilter, bills: { none: {} } },
        take: 100, orderBy: { registeredAt: 'desc' },
      })).map((c) => ({ c: c.firstName, p: c.phone, d: c.registeredAt, s: c.status })),
    }),
    vsscSales: async () => productSalesReport('VSSC', period, branchFilter),
    procedureCompletedFu: async () => followUpReport('PROCEDURE_COMPLETED', branchFilter),
    aftPrpBooking: async () => apptReport({ type: 'TREATMENT' }, period),
    callAuditLead: async () => ({
      columns: cols(['Audit', 'a'], ['Score', 's'], ['Findings', 'f']),
      rows: (await prisma.callAudit.findMany({
        where: { callType: { contains: 'LEAD' } }, take: 100, orderBy: { auditedAt: 'desc' },
      })).map((a) => ({ a: a.auditNo, s: a.score, f: a.findings || '—' })),
    }),
    callAuditGenuinity: async () => ({
      columns: cols(['Audit', 'a'], ['Score', 's'], ['Findings', 'f']),
      rows: (await prisma.callAudit.findMany({
        where: { callType: { contains: 'APPOINTMENT' } }, take: 100, orderBy: { auditedAt: 'desc' },
      })).map((a) => ({ a: a.auditNo, s: a.score, f: a.findings || '—' })),
    }),
    ccLeadUpload: async () => ({
      columns: cols(['Customer', 'c'], ['Phone', 'p'], ['Source', 's'], ['Date', 'd']),
      rows: (await prisma.customer.findMany({
        where: { leadSource: { not: null } }, take: 100, orderBy: { registeredAt: 'desc' },
      })).map((c) => ({ c: c.firstName, p: c.phone, s: c.leadSource, d: c.registeredAt })),
    }),
    ccSmsLog: async () => ({
      columns: cols(['Channel', 'c'], ['Recipient', 'r'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.notificationLog.findMany({
        where: { type: 'SMS' }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((n) => ({ c: n.type, r: n.recipient, p: n.recipient, s: n.status, d: n.createdAt })),
    }),
    rptBranchCumulative: async () => {
      const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
      const rows = await Promise.all(branches.map(async (b) => {
        const agg = await prisma.bill.aggregate({
          where: { branchId: b.id, billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED'] } },
          _sum: { totalAmount: true }, _count: true,
        });
        return { b: b.name, r: agg._sum.totalAmount || 0, n: agg._count };
      }));
      return { columns: cols(['Branch', 'b'], ['Revenue', 'r'], ['Bills', 'n']), rows };
    },
    incentiveAesthetics: async () => ({
      columns: cols(['Branch', 'b'], ['Target', 't'], ['Achieved', 'a']),
      rows: (await prisma.locationTargetDay.findMany({
        where: { branch: { type: 'AESTHETICS' } },
        include: { branch: true },
        take: 50, orderBy: { targetDate: 'desc' },
      })).map((r) => ({ b: r.branch.name, t: r.target, a: r.achieved })),
    }),
    incentiveTherapistHair: async () => ({
      columns: cols(['Category', 'c'], ['Rate %', 'r'], ['Flat', 'f']),
      rows: (await prisma.therapistIncentiveRule.findMany({ where: { category: 'HAIR' } })).map((r) => ({
        c: r.category, r: r.ratePercent, f: r.flatAmount,
      })),
    }),
    incentiveTherapistSkin: async () => ({
      columns: cols(['Category', 'c'], ['Rate %', 'r'], ['Flat', 'f']),
      rows: (await prisma.therapistIncentiveRule.findMany({ where: { category: 'SKIN' } })).map((r) => ({
        c: r.category, r: r.ratePercent, f: r.flatAmount,
      })),
    }),
    incentiveOverallDay: async () => {
      const report = await getConsultantIncentiveReport(period.month, period.year);
      return {
        columns: cols(['Consultant', 'c'], ['Sales', 's'], ['Incentive', 'i']),
        rows: report.map((r) => ({
          c: `${r.consultant.firstName} ${r.consultant.lastName}`,
          s: r.revenue,
          i: r.incentive,
        })),
      };
    },
    incentiveOverallMonth: async () => {
      const now = new Date();
      const report = await getConsultantIncentiveReport(now.getMonth() + 1, now.getFullYear());
      return {
        columns: cols(['Consultant', 'c'], ['Sales', 's'], ['Incentive', 'i']),
        rows: report.map((r) => ({
          c: `${r.consultant.firstName} ${r.consultant.lastName}`,
          s: r.revenue,
          i: r.incentive,
        })),
      };
    },
    inflowExisting: async () => {
      const inflow = await getInflowSales(branchFilter, period.from, period.to);
      return {
        kpis: [{ label: 'Existing Customer Revenue', value: inflow.existing.revenue }],
        columns: cols(['Segment', 's'], ['Revenue', 'r'], ['Bills', 'b']),
        rows: [{ s: 'Existing', r: inflow.existing.revenue, b: inflow.existing.count }],
      };
    },
    inflowNew: async () => {
      const inflow = await getInflowSales(branchFilter, period.from, period.to);
      return {
        kpis: [{ label: 'New Customer Revenue', value: inflow.new.revenue }],
        columns: cols(['Segment', 's'], ['Revenue', 'r'], ['Bills', 'b']),
        rows: [{ s: 'New', r: inflow.new.revenue, b: inflow.new.count }],
      };
    },
    headsDaySales: async () => ({
      columns: cols(['Date', 'd'], ['Revenue', 'r'], ['Bills', 'b']),
      rows: await dailySalesRows(period, branchFilter),
    }),
    headsMonthSales: async () => ({
      columns: cols(['Month', 'm'], ['Revenue', 'r']),
      rows: await fyMonthlySales(branchFilter).then((rows) => rows.map((r) => ({ m: r.m, r: r.r }))),
    }),
    headsBranchSales: async () => {
      const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
      const rows = await Promise.all(branches.map(async (b) => {
        const agg = await prisma.bill.aggregate({
          where: { branchId: b.id, billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED'] } },
          _sum: { totalAmount: true },
        });
        return { b: b.name, r: agg._sum.totalAmount || 0 };
      }));
      return { columns: cols(['Branch', 'b'], ['Revenue', 'r']), rows };
    },
    poSearch: async () => ({
      columns: cols(['PO', 'p'], ['Vendor', 'v'], ['Amount', 'a'], ['Status', 's']),
      rows: (await prisma.purchaseOrder.findMany({
        include: { vendor: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((p) => ({ p: p.poNo, v: p.vendor.name, a: p.totalAmount, s: p.status })),
    }),
    challanCancel: async () => ({
      columns: cols(['Challan', 'c'], ['Order', 'o'], ['Status', 's']),
      rows: (await prisma.deliveryChallan.findMany({
        where: { status: 'ISSUED' },
        include: { order: true }, take: 100,
      })).map((c) => ({ c: c.challanNo, o: c.order.orderNo, s: c.status, _id: c.id })),
    }),
    loanEstimate: async () => ({
      columns: cols(['Loan', 'l'], ['Customer', 'c'], ['Principal', 'p'], ['Status', 's']),
      rows: (await prisma.loanAccount.findMany({
        where: { status: 'PENDING' },
        include: { customer: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((l) => ({ l: l.loanNo, c: l.customer.firstName, p: l.principal, s: l.status, _id: l.id })),
    }),
    joinedCustomerFeedback: async () => ({
      columns: cols(['Customer', 'c'], ['Rating', 'r'], ['Feedback', 'cm'], ['Date', 'd']),
      rows: (await prisma.treatmentFeedback.findMany({
        include: { customer: true }, take: 100, orderBy: { submittedAt: 'desc' },
      })).map((f) => ({ c: f.customer.firstName, r: f.rating, cm: f.feedback || '—', d: f.submittedAt })),
    }),
    joinedFollowUp: async () => followUpReport('JOINED', branchFilter),
    meetingConsultantAnnual: async () => ({
      columns: cols(['Consultant', 'c'], ['Revenue', 'r'], ['Bills', 'b']),
      rows: await consultantSalesRows(period, branchFilter),
    }),
    meetingLocationPerformance: async () => {
      const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
      const rows = await Promise.all(branches.map(async (b) => {
        const agg = await prisma.bill.aggregate({
          where: { branchId: b.id, status: { notIn: ['CANCELLED'] } },
          _sum: { totalAmount: true }, _count: true,
        });
        return { b: b.name, r: agg._sum.totalAmount || 0, n: agg._count };
      }));
      return { columns: cols(['Branch', 'b'], ['Revenue', 'r'], ['Bills', 'n']), rows };
    },
    meetingConsultantPerformance: async () => ({
      columns: cols(['Consultant', 'c'], ['Revenue', 'r'], ['Bills', 'b']),
      rows: await consultantSalesRows(period, branchFilter),
    }),
    meetingDailyInflow: async () => {
      const inflow = await getInflowSales(branchFilter, period.from, period.to);
      return {
        columns: cols(['Segment', 's'], ['Revenue', 'r'], ['Bills', 'b']),
        rows: [
          { s: 'Existing', r: inflow.existing.revenue, b: inflow.existing.count },
          { s: 'New', r: inflow.new.revenue, b: inflow.new.count },
        ],
      };
    },
    meetingAnnualSales: async () => ({
      columns: cols(['Month', 'm'], ['Revenue', 'r']),
      rows: await fyMonthlySales(branchFilter),
    }),
    meetingHmaAnnual: async () => ({
      columns: cols(['Month', 'm'], ['Tests', 't']),
      rows: await monthlyTestCounts('HMA'),
    }),
    meetingLocationTargetMonth: async () => ({
      columns: cols(['Branch', 'b'], ['Target', 't'], ['Achieved', 'a']),
      rows: (await prisma.locationTargetDay.findMany({
        include: { branch: true }, take: 100, orderBy: { targetDate: 'desc' },
      })).map((r) => ({ b: r.branch.name, t: r.target, a: r.achieved })),
    }),
    meetingTreatmentExecution: async () => ({
      columns: cols(['Status', 's'], ['Count', 'c']),
      rows: (await prisma.procedure.groupBy({ by: ['status'], _count: true })).map((g) => ({ s: g.status, c: g._count })),
    }),
    meetingTreatmentStatusHs: async () => ({
      columns: cols(['Customer', 'c'], ['Procedure', 'p'], ['Status', 's']),
      rows: (await prisma.procedure.findMany({
        include: { customer: true }, take: 100, orderBy: { scheduledAt: 'desc' },
      })).map((p) => ({ c: p.customer.firstName, p: p.procedureNo, s: p.status })),
    }),
    meetingAnnualLead: async () => ({
      columns: cols(['Month', 'm'], ['Leads', 'l']),
      rows: await monthlyRegistrationRows(branchFilter),
    }),
    meetingLeadManagement: async () => ({
      columns: cols(['Customer', 'c'], ['Phone', 'p'], ['Source', 's'], ['Status', 'st']),
      rows: (await prisma.customer.findMany({
        where: { ...branchFilter, bills: { none: {} } },
        take: 100, orderBy: { registeredAt: 'desc' },
      })).map((c) => ({ c: `${c.firstName} ${c.lastName}`, p: c.phone, s: c.leadSource || '—', st: c.status })),
    }),
    meetingLeadVsAppt: async () => ({
      columns: cols(['Date', 'd'], ['Leads', 'l'], ['Appointments', 'a']),
      rows: await dailyLeadApptRows(period, branchFilter),
    }),
    meetingBilledVsAdvance: async () => {
      const [bills, advances] = await Promise.all([
        prisma.bill.aggregate({
          where: { billDate: { gte: period.from, lte: period.to }, ...branchWhere(branchFilter), status: { notIn: ['CANCELLED'] } },
          _sum: { totalAmount: true },
        }),
        prisma.advanceReceipt.aggregate({
          where: { createdAt: { gte: period.from, lte: period.to }, ...branchWhere(branchFilter) },
          _sum: { amount: true },
        }),
      ]);
      return {
        columns: cols(['Type', 't'], ['Amount', 'a']),
        rows: [
          { t: 'Billed', a: bills._sum.totalAmount || 0 },
          { t: 'Advance Receipts', a: advances._sum.amount || 0 },
        ],
      };
    },
    meetingPendingSession: async () => ({
      columns: cols(['Customer', 'c'], ['Procedure', 'p'], ['Status', 's']),
      rows: (await prisma.procedure.findMany({
        where: { status: { in: ['BOOKED', 'IN_PROGRESS'] } },
        include: { customer: true }, take: 100,
      })).map((p) => ({ c: p.customer.firstName, p: p.procedureNo, s: p.status })),
    }),
    meetingConsultantAchievement: async () => ({
      columns: cols(['Consultant', 'c'], ['Revenue', 'r'], ['Bills', 'b']),
      rows: await consultantSalesRows(period, branchFilter),
    }),
    gstSacSummary: async () => sacBillReport(period, branchFilter, 'summary'),
    gstSacDaywise: async () => sacBillReport(period, branchFilter, 'daywise'),
    gstSacB2b: async () => billListReport({ customer: { customerType: 'CORPORATE' } }, branchFilter),
    gstSacB2c: async () => billListReport({ customer: { customerType: 'INDIVIDUAL' } }, branchFilter),
    gstSacPurchase: async () => ({
      columns: cols(['PO', 'p'], ['Product', 'pr'], ['SAC', 's'], ['Amount', 'a']),
      rows: (await prisma.pOItem.findMany({
        include: { product: true, po: true }, take: 200,
      })).map((i) => ({ p: i.po.poNo, pr: i.product.name, s: i.product.sacCode || '—', a: i.totalAmount })),
    }),
    highestSalesDay: async () => {
      const rows = await dailySalesRows(period, branchFilter);
      const best = rows.sort((a, b) => b.r - a.r)[0];
      return {
        kpis: [{ label: 'Best Day Revenue', value: best?.r || 0 }],
        columns: cols(['Date', 'd'], ['Revenue', 'r'], ['Bills', 'b']),
        rows: rows.sort((a, b) => b.r - a.r).slice(0, 10),
      };
    },
    highestSalesMonth: async () => {
      const rows = await fyMonthlySales(branchFilter);
      const best = rows.sort((a, b) => b.r - a.r)[0];
      return {
        kpis: [{ label: 'Best Month Revenue', value: best?.r || 0 }],
        columns: cols(['Month', 'm'], ['Revenue', 'r']),
        rows: rows.sort((a, b) => b.r - a.r).slice(0, 6),
      };
    },
    highestSalesState: async () => ({
      columns: cols(['State', 's'], ['Revenue', 'r']),
      rows: await stateSalesRows(period),
    }),
    branchHighestDayMonth: async () => ({
      columns: cols(['Branch', 'b'], ['Day Best', 'd'], ['Month Best', 'm']),
      rows: await branchHighestRows(branchFilter),
    }),
    dashBranchConsultant: async () => {
      const bills = await prisma.bill.findMany({
        where: { billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED'] }, ...branchWhere(branchFilter) },
        include: { createdBy: true, branch: true },
      });
      const map = {};
      for (const bill of bills) {
        const key = bill.createdById;
        if (!map[key]) map[key] = { c: `${bill.createdBy.firstName} ${bill.createdBy.lastName}`, b: bill.branch.name, r: 0 };
        map[key].r += bill.totalAmount;
      }
      return { columns: cols(['Consultant', 'c'], ['Branch', 'b'], ['Revenue', 'r']), rows: Object.values(map) };
    },
    investmentReport: async () => ({
      columns: cols(['Investment', 'i'], ['Category', 'c'], ['Amount', 'a'], ['Date', 'd']),
      rows: (await prisma.investment.findMany({
        include: { branch: true }, take: 100, orderBy: { investedAt: 'desc' },
      })).map((v) => ({ i: v.invNo, c: v.category, a: v.amount, d: v.investedAt })),
    }),
    newJoineeView: async () => ({
      columns: cols(['Employee', 'e'], ['Name', 'n'], ['Designation', 'd'], ['Status', 's']),
      rows: (await prisma.newJoinee.findMany({
        include: { branch: true }, take: 100, orderBy: { createdAt: 'desc' },
      })).map((j) => ({ e: j.employeeId, n: `${j.firstName} ${j.lastName}`, d: j.designation || '—', s: j.status })),
    }),
    staffCount: async () => ({
      columns: cols(['Branch', 'b'], ['Staff', 's']),
      rows: await staffCountByBranch(),
    }),
    procedureFormList: async () => ({
      columns: cols(['Procedure', 'p'], ['Customer', 'c'], ['Status', 's'], ['Date', 'd']),
      rows: (await prisma.procedure.findMany({
        include: { customer: true }, take: 100, orderBy: { scheduledAt: 'desc' },
      })).map((p) => ({ p: p.procedureNo, c: p.customer.firstName, s: p.status, d: p.scheduledAt, _id: p.id })),
    }),
    procedureConsentList: async () => ({
      columns: cols(['Procedure', 'p'], ['Customer', 'c'], ['Consent', 'co']),
      rows: (await prisma.procedure.findMany({
        include: { customer: true }, take: 100,
      })).map((p) => ({ p: p.procedureNo, c: p.customer.firstName, co: p.consentGiven ? 'Yes' : 'Pending', _id: p.id })),
    }),
    procedurePhotosList: async () => ({
      columns: cols(['Procedure', 'p'], ['Customer', 'c'], ['Consent Form', 'f']),
      rows: (await prisma.procedure.findMany({
        include: { customer: true }, take: 100,
      })).map((p) => ({
        p: p.procedureNo, c: p.customer.firstName, f: p.consentFormPath ? 'Uploaded' : '—',
      })),
    }),
    preProcedurePhotos: async () => photoTypeReport('PROCEDURE_PRE'),
    postProcedurePhotos: async () => photoTypeReport('PROCEDURE_POST'),
    vendorClinicalItems: async () => vendorProductReport('CLINICAL'),
    vendorBillableItems: async () => vendorProductReport('BILLABLE'),
    salesCustomerMaster: async () => ({
      columns: cols(['Customer', 'c'], ['Type', 't'], ['GSTIN', 'g']),
      rows: (await prisma.customer.findMany({
        where: { customerType: 'CORPORATE' }, take: 100,
      })).map((c) => ({ c: c.companyName || c.firstName, t: c.customerType, g: c.gstin || '—' })),
    }),
    productTaxMaster: async () => ({
      columns: cols(['Product', 'p'], ['HSN', 'h'], ['Tax %', 't']),
      rows: (await prisma.product.findMany({ where: { isActive: true }, take: 200 })).map((p) => ({
        p: p.name, h: p.hsnCode || '—', t: p.taxRate, _id: p.id,
      })),
    }),
    advanceKitMaster: async () => ({
      columns: cols(['Kit', 'k'], ['Name', 'n'], ['Type', 't']),
      rows: (await prisma.kitMapping.findMany({ take: 100 })).map((k) => ({
        k: k.kitCode, n: k.name, t: k.mapType, _id: k.id,
      })),
    }),
    productMappingMaster: async () => ({
      columns: cols(['Kit', 'k'], ['Name', 'n'], ['Items', 'i']),
      rows: (await prisma.kitMapping.findMany({ take: 100 })).map((k) => ({
        k: k.kitCode, n: k.name, i: k.itemsJson || '—', _id: k.id,
      })),
    }),
    clinicalServiceMaster: async () => ({
      columns: cols(['Code', 'c'], ['Service', 's'], ['Category', 'cat'], ['Price', 'p']),
      rows: (await prisma.clinicalTreatment.findMany({ take: 100 })).map((t) => ({
        c: t.code, s: t.name, cat: t.category, p: t.basePrice, _id: t.id,
      })),
    }),
    assetBarcodeList: async () => ({
      columns: cols(['Asset', 'a'], ['Name', 'n'], ['Barcode', 'b'], ['Branch', 'br']),
      rows: (await prisma.asset.findMany({ include: { branch: true }, take: 100 })).map((a) => ({
        a: a.assetNo, n: a.name, b: a.barcode || '—', br: a.branch?.name || '—', _id: a.id,
      })),
    }),
    fixNewAppointment: async () => ({
      form: true,
      customers: await prisma.customer.findMany({ where: branchFilter, take: 100 }),
      branches: await prisma.branch.findMany({ where: { isActive: true } }),
      consultants: await prisma.user.findMany({
        where: { isActive: true, role: { name: { in: ['CONSULTANT', 'BRANCH_MANAGER'] } } },
        select: { id: true, firstName: true, lastName: true },
        take: 50,
      }),
    }),
  };

  if (screen.type === 'master' && screen.model) {
    return getMasterScreenData(screen, req);
  }

  const handler = handlers[screen.dataKey];
  if (!handler) return enrichScreenData(screen, { columns: cols(['Info', 'i']), rows: [{ i: 'No data configured.' }], period, branchFilter });
  const data = await handler();
  return enrichScreenData(screen, { period, branchFilter, ...data });
}

async function getMasterScreenData(screen, req) {
  const model = prisma[screen.model];
  if (!model) return { rows: [], fields: screen.fields };
  const noCreatedAt = new Set(['assetCategory', 'oTMaster', 'courier', 'transporter', 'deliveryAt', 'banner']);
  const rows = await model.findMany({
    take: 200,
    orderBy: noCreatedAt.has(screen.model) ? { code: 'asc' } : { createdAt: 'desc' },
  }).catch(() => []);
  const extras = {};
  if (screen.model === 'refundComplaint') {
    extras.customers = await prisma.customer.findMany({ where: req.branchFilter, take: 100 });
  }
  if (screen.model === 'productBatch') {
    extras.products = await prisma.product.findMany({ where: { isActive: true }, take: 100 });
  }
  if (screen.model === 'dTRRecord' || screen.model === 'manpowerRequisition' || screen.model === 'factoryIndent') {
    extras.branches = await prisma.branch.findMany({ where: { isActive: true } });
  }
  return { rows, fields: screen.fields, model: screen.model, ...extras };
}

export async function createMasterRecord(model, body, user) {
  const m = prisma[model];
  if (!m) throw new Error('Invalid model');
  const data = { ...body };
  if (data.headcount) data.headcount = parseInt(data.headcount, 10);
  if (data.amount) data.amount = parseFloat(data.amount);
  if (data.openingCash) data.openingCash = parseFloat(data.openingCash);
  if (data.closingCash) data.closingCash = parseFloat(data.closingCash);
  if (data.basePrice) data.basePrice = parseFloat(data.basePrice);
  if (data.ratePercent) data.ratePercent = parseFloat(data.ratePercent);
  if (data.flatAmount) data.flatAmount = parseFloat(data.flatAmount);
  if (data.totalAmount) data.totalAmount = parseFloat(data.totalAmount);
  if (data.periodMonth) data.periodMonth = parseInt(data.periodMonth, 10);
  if (data.periodYear) data.periodYear = parseInt(data.periodYear, 10);
  if (data.score) data.score = parseInt(data.score, 10);
  if (user?.branchId && !data.branchId) data.branchId = user.branchId;
  if (!data.createdById && user?.id) data.createdById = user.id;
  if (!data.uploadedById && user?.id && model === 'documentStore') data.uploadedById = user.id;
  if (!data.auditedById && user?.id && model === 'callAudit') data.auditedById = user.id;
  if (!data.requesterId && user?.id && model === 'reimbursementClaim') data.requesterId = user.id;
  if (model === 'refundComplaint' && !data.complaintNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.complaintNo = await generateNumber('RC', 'refundComplaint', 'complaintNo');
  }
  if (model === 'dTRRecord' && !data.dtrNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.dtrNo = await generateNumber('DTR', 'dTRRecord', 'dtrNo');
  }
  if (model === 'manpowerRequisition' && !data.reqNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.reqNo = await generateNumber('MPR', 'manpowerRequisition', 'reqNo');
  }
  if (model === 'investment' && !data.invNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.invNo = await generateNumber('INV', 'investment', 'invNo');
  }
  if (model === 'reimbursementClaim' && !data.claimNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.claimNo = await generateNumber('CLM', 'reimbursementClaim', 'claimNo');
  }
  if (model === 'callAudit' && !data.auditNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.auditNo = await generateNumber('CAU', 'callAudit', 'auditNo');
  }
  if (model === 'factoryIndent' && !data.indentNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.indentNo = await generateNumber('FIN', 'factoryIndent', 'indentNo');
  }
  if (model === 'assetPurchaseOrder' && !data.apoNo) {
    const { generateNumber } = await import('../utils/helpers.js');
    data.apoNo = await generateNumber('APO', 'assetPurchaseOrder', 'apoNo');
  }
  return m.create({ data });
}

const NUMERIC_FIELDS = ['headcount', 'amount', 'openingCash', 'closingCash', 'basePrice', 'ratePercent', 'flatAmount', 'totalAmount', 'periodMonth', 'periodYear', 'score'];

function parseMasterBody(body) {
  const data = { ...body };
  for (const key of NUMERIC_FIELDS) {
    if (data[key] !== undefined && data[key] !== '') data[key] = key.includes('count') || key.includes('Month') || key.includes('Year') || key === 'score'
      ? parseInt(data[key], 10) : parseFloat(data[key]);
  }
  return data;
}

export async function updateMasterRecord(model, id, body) {
  const m = prisma[model];
  if (!m) throw new Error('Invalid model');
  const data = parseMasterBody(body);
  delete data.id;
  return m.update({ where: { id }, data });
}

export async function deleteMasterRecord(model, id) {
  const m = prisma[model];
  if (!m) throw new Error('Invalid model');
  return m.delete({ where: { id } });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function testStatusReport(type) {
  const tests = await prisma.customerTest.findMany({
    where: { type },
    include: { customer: true },
    orderBy: { testedAt: 'desc' },
    take: 100,
  });
  return {
    columns: cols(['Test', 't'], ['Customer', 'c'], ['Status', 's'], ['Date', 'd']),
    rows: tests.map((t) => ({ t: t.testNo, c: t.customer.firstName, s: t.status, d: t.testedAt })),
  };
}

function branchWhere(branchFilter) {
  return branchFilter.branchId ? { branchId: branchFilter.branchId } : {};
}

async function billListReport(whereExtra, branchFilter, monthsBack = 0) {
  const from = monthsBack ? subMonths(new Date(), monthsBack) : new Date(0);
  const bills = await prisma.bill.findMany({
    where: { ...whereExtra, ...branchWhere(branchFilter), billDate: { gte: from } },
    include: { customer: true },
    take: 100,
    orderBy: { billDate: 'desc' },
  });
  return {
    columns: cols(['Bill', 'b'], ['Customer', 'c'], ['Total', 't'], ['Status', 's']),
    rows: bills.map((b) => ({ b: b.billNo, c: b.customer.firstName, t: b.totalAmount, s: b.status })),
  };
}

async function apptReport(where, period) {
  const appts = await prisma.appointment.findMany({
    where: { ...where, scheduledAt: { gte: period.from, lte: period.to } },
    include: { customer: true, consultant: true, branch: true },
    take: 100,
    orderBy: { scheduledAt: 'desc' },
  });
  return {
    columns: cols(['Date', 'd'], ['Customer', 'c'], ['Consultant', 'co'], ['Status', 's']),
    rows: appts.map((a) => ({
      d: a.scheduledAt, c: a.customer.firstName,
      co: a.consultant ? a.consultant.firstName : '—', s: a.status,
      a: a.appointmentNo, _id: a.id,
    })),
  };
}

async function followUpReport(type, branchFilter) {
  const where = {
    ...(type ? { type } : {}),
    status: 'PENDING',
    ...(branchFilter.branchId ? { customer: { branchId: branchFilter.branchId } } : {}),
  };
  const rows = await prisma.followUp.findMany({
    where,
    include: { customer: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
  return {
    columns: cols(['Customer', 'c'], ['Type', 't'], ['Status', 's'], ['Scheduled', 'd']),
    rows: rows.map((f) => ({
      c: f.customer.firstName, t: f.type, s: f.status, d: f.scheduledAt,
      _id: f.id, _customerId: f.customerId, u: f.customer.uhid,
    })),
  };
}

async function stockMovementReport(movementType, productType, period, branchFilter) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      movementType,
      createdAt: { gte: period.from, lte: period.to },
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
      product: { type: productType },
    },
    include: { product: true, branch: true },
    take: 100,
  });
  return {
    columns: cols(['Product', 'p'], ['Branch', 'b'], ['Qty', 'q'], ['Date', 'd']),
    rows: movements.map((m) => ({ p: m.product.name, b: m.branch.name, q: m.quantity, d: m.createdAt })),
  };
}

async function pendingIndentByType(type) {
  const indents = await prisma.indent.findMany({
    where: { type, status: { in: ['PENDING', 'APPROVED', 'PARTIAL'] } },
    include: { items: { include: { product: true } }, branch: true },
    take: 50,
  });
  const rows = [];
  for (const ind of indents) {
    for (const item of ind.items) {
      if (item.fulfilled < item.quantity) {
        rows.push({ i: ind.indentNo, p: item.product.name, q: item.quantity - item.fulfilled, b: ind.branch.name });
      }
    }
  }
  return {
    columns: cols(['Indent', 'i'], ['Product', 'p'], ['Pending Qty', 'q'], ['Branch', 'b']),
    rows,
  };
}

async function pendingIndentItems() {
  return pendingIndentByType('BILLABLE');
}

async function categoryDaySales(category, period, branchFilter) {
  const bills = await prisma.bill.findMany({
    where: {
      billDate: { gte: period.from, lte: period.to },
      status: { notIn: ['CANCELLED'] },
      customer: { category, ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}) },
    },
    take: 100,
    orderBy: { billDate: 'desc' },
  });
  return {
    columns: cols(['Bill', 'b'], ['Total', 't'], ['Date', 'd']),
    rows: bills.map((b) => ({ b: b.billNo, t: b.totalAmount, d: b.billDate })),
  };
}

async function monthSales(monthsAgo, branchFilter) {
  const d = subMonths(new Date(), monthsAgo);
  const agg = await prisma.bill.aggregate({
    where: {
      billDate: { gte: startOfMonth(d), lte: endOfMonth(d) },
      status: { notIn: ['CANCELLED'] },
      ...branchWhere(branchFilter),
    },
    _sum: { totalAmount: true },
  });
  return agg._sum.totalAmount || 0;
}

async function dailySalesRows(period, branchFilter) {
  const bills = await prisma.bill.findMany({
    where: {
      billDate: { gte: period.from, lte: period.to },
      status: { notIn: ['CANCELLED'] },
      ...branchWhere(branchFilter),
    },
    select: { billDate: true, totalAmount: true },
  });
  const byDay = {};
  for (const b of bills) {
    const key = b.billDate.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { r: 0, c: 0 };
    byDay[key].r += b.totalAmount;
    byDay[key].c += 1;
  }
  return Object.entries(byDay).map(([d, v]) => ({ d, r: v.r, b: v.c }));
}

async function consultantSalesRows(period, branchFilter) {
  const bills = await prisma.bill.findMany({
    where: {
      billDate: { gte: period.from, lte: period.to },
      status: { notIn: ['CANCELLED'] },
      ...branchWhere(branchFilter),
    },
    include: { createdBy: true },
  });
  const map = {};
  for (const b of bills) {
    const key = b.createdById;
    if (!map[key]) map[key] = { c: `${b.createdBy.firstName} ${b.createdBy.lastName}`, r: 0, n: 0 };
    map[key].r += b.totalAmount;
    map[key].n += 1;
  }
  return Object.values(map).map((v) => ({ c: v.c, r: v.r, b: v.n }));
}

async function productSalesReport(keyword, period, branchFilter) {
  const items = await prisma.billItem.findMany({
    where: {
      itemName: { contains: keyword },
      bill: { billDate: { gte: period.from, lte: period.to }, ...branchWhere(branchFilter) },
    },
    take: 100,
  });
  return {
    columns: cols(['Item', 'i'], ['Qty', 'q'], ['Revenue', 'r']),
    rows: items.map((i) => ({ i: i.itemName, q: i.quantity, r: i.totalAmount })),
  };
}

async function meetingNewRegularReport(period, branchFilter) {
  const newCust = await prisma.customer.count({
    where: { registeredAt: { gte: period.from, lte: period.to }, ...branchFilter, bills: { none: {} } },
  });
  const regular = await prisma.customer.count({
    where: { ...branchFilter, bills: { some: { billDate: { gte: period.from, lte: period.to } } } },
  });
  return {
    columns: cols(['Segment', 's'], ['Count', 'c']),
    rows: [{ s: 'New (no bill)', c: newCust }, { s: 'Regular (repeat bill)', c: regular }],
  };
}

async function fyMonthlySales(branchFilter) {
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const agg = await prisma.bill.aggregate({
      where: {
        billDate: { gte: startOfMonth(d), lte: endOfMonth(d) },
        status: { notIn: ['CANCELLED'] },
        ...branchWhere(branchFilter),
      },
      _sum: { totalAmount: true },
    });
    rows.push({ m: `${d.getMonth() + 1}/${d.getFullYear()}`, r: agg._sum.totalAmount || 0, i: agg._sum.totalAmount || 0 });
  }
  return rows;
}

async function monthlyConversionRows(branchFilter) {
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const from = startOfMonth(d);
    const to = endOfMonth(d);
    const reg = await prisma.customer.count({ where: { registeredAt: { gte: from, lte: to }, ...branchFilter } });
    const conv = await prisma.customer.count({
      where: { registeredAt: { gte: from, lte: to }, ...branchFilter, bills: { some: {} } },
    });
    rows.push({ m: `${d.getMonth() + 1}/${d.getFullYear()}`, r: reg, c: conv });
  }
  return rows;
}

async function branchVisitsComparison(period) {
  const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
  return Promise.all(branches.map(async (b) => {
    const visits = await prisma.customerVisit.count({
      where: { branchId: b.id, visitedAt: { gte: period.from, lte: period.to } },
    });
    const appts = await prisma.appointment.count({
      where: { branchId: b.id, scheduledAt: { gte: period.from, lte: period.to } },
    });
    return { b: b.name, v: visits, a: appts };
  }));
}

async function monthlyTestCounts(type) {
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const count = await prisma.customerTest.count({
      where: { type, testedAt: { gte: startOfMonth(d), lte: endOfMonth(d) } },
    });
    rows.push({ m: `${d.getMonth() + 1}/${d.getFullYear()}`, t: count });
  }
  return rows;
}

async function monthlyRegistrationRows(branchFilter) {
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const count = await prisma.customer.count({
      where: { registeredAt: { gte: startOfMonth(d), lte: endOfMonth(d) }, ...branchFilter },
    });
    rows.push({ m: `${d.getMonth() + 1}/${d.getFullYear()}`, l: count });
  }
  return rows;
}

async function dailyLeadApptRows(period, branchFilter) {
  const [customers, appts] = await Promise.all([
    prisma.customer.findMany({
      where: { registeredAt: { gte: period.from, lte: period.to }, ...branchFilter },
      select: { registeredAt: true },
    }),
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: period.from, lte: period.to }, ...branchWhere(branchFilter) },
      select: { scheduledAt: true },
    }),
  ]);
  const byDay = {};
  for (const c of customers) {
    const key = c.registeredAt.toISOString().slice(0, 10);
    byDay[key] = byDay[key] || { l: 0, a: 0 };
    byDay[key].l += 1;
  }
  for (const a of appts) {
    const key = a.scheduledAt.toISOString().slice(0, 10);
    byDay[key] = byDay[key] || { l: 0, a: 0 };
    byDay[key].a += 1;
  }
  return Object.entries(byDay).map(([d, v]) => ({ d, l: v.l, a: v.a }));
}

async function sacBillReport(period, branchFilter, mode) {
  const bills = await prisma.bill.findMany({
    where: { billDate: { gte: period.from, lte: period.to }, ...branchWhere(branchFilter), status: { notIn: ['CANCELLED'] } },
    include: { items: true },
    take: 500,
  });
  if (mode === 'daywise') {
    const byDay = {};
    for (const b of bills) {
      const key = b.billDate.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + b.totalAmount;
    }
    return {
      columns: cols(['Date', 'd'], ['Revenue', 'r']),
      rows: Object.entries(byDay).map(([d, r]) => ({ d, r })),
    };
  }
  const total = bills.reduce((s, b) => s + b.totalAmount, 0);
  return {
    columns: cols(['Metric', 'm'], ['Value', 'v']),
    rows: [{ m: 'SAC Sales Total', v: total }, { m: 'Bill Count', v: bills.length }],
  };
}

async function stateSalesRows(period) {
  const bills = await prisma.bill.findMany({
    where: { billDate: { gte: period.from, lte: period.to }, status: { notIn: ['CANCELLED'] } },
    include: { branch: { include: { city: { include: { state: true } } } } },
  });
  const map = {};
  for (const b of bills) {
    const state = b.branch?.city?.state?.name || 'Unknown';
    map[state] = (map[state] || 0) + b.totalAmount;
  }
  return Object.entries(map).map(([s, r]) => ({ s, r }));
}

async function branchHighestRows(branchFilter) {
  const branches = await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } });
  return Promise.all(branches.map(async (b) => {
    const bills = await prisma.bill.findMany({
      where: { branchId: b.id, status: { notIn: ['CANCELLED'] } },
      select: { billDate: true, totalAmount: true },
    });
    const byDay = {};
    const byMonth = {};
    for (const bill of bills) {
      const day = bill.billDate.toISOString().slice(0, 10);
      const month = `${bill.billDate.getMonth() + 1}/${bill.billDate.getFullYear()}`;
      byDay[day] = (byDay[day] || 0) + bill.totalAmount;
      byMonth[month] = (byMonth[month] || 0) + bill.totalAmount;
    }
    const dayBest = Math.max(0, ...Object.values(byDay));
    const monthBest = Math.max(0, ...Object.values(byMonth));
    return { b: b.name, d: dayBest, m: monthBest };
  }));
}

async function staffCountByBranch() {
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  return Promise.all(branches.map(async (b) => {
    const count = await prisma.user.count({ where: { branchId: b.id, isActive: true } });
    return { b: b.name, s: count };
  }));
}

async function photoTypeReport(type) {
  const photos = await prisma.customerPhoto.findMany({
    where: { type },
    include: { customer: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
  return {
    columns: cols(['Customer', 'c'], ['Caption', 'ca'], ['Date', 'd']),
    rows: photos.map((p) => ({ c: p.customer.firstName, ca: p.caption || '—', d: p.createdAt })),
  };
}

async function vendorProductReport(type) {
  const products = await prisma.product.findMany({
    where: { type, isActive: true },
    include: { vendor: true },
    take: 200,
  });
  return {
    columns: cols(['Product', 'p'], ['Vendor', 'v'], ['SKU', 's']),
    rows: products.map((p) => ({ p: p.name, v: p.vendor?.name || '—', s: p.sku })),
  };
}
