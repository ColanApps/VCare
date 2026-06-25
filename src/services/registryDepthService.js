import { prisma } from '../lib/prisma.js';
import { REGISTRY_SCREEN_META, REGISTRY_ACTIONS } from '../config/registryWorkflowMap.js';
import { mergeScreenMeta } from '../config/workflowInference.js';

const ENTITIES = {
  bill: { model: 'bill', field: 'billNo', href: (id) => `/billing/${id}` },
  creditNote: { model: 'creditNote', field: 'creditNoteNo', href: (id) => `/billing/credit-notes` },
  loan: { model: 'loanAccount', field: 'loanNo', href: () => `/billing/loans` },
  loanInstallment: { model: 'loanAccount', field: 'loanNo', href: () => `/billing/loans` },
  customerUhid: { model: 'customer', field: 'uhid', href: (id) => `/customer/${id}` },
  customerPhone: { model: 'customer', field: 'phone', href: (id) => `/customer/${id}` },
  customerName: { model: 'customer', field: 'firstName', href: (id) => `/customer/${id}` },
  purchaseOrder: { model: 'purchaseOrder', field: 'poNo', href: () => `/purchase/orders` },
  grn: { model: 'gRN', field: 'grnNo', href: (id, row) => {
    if (row._grnType === 'AESTHETICS') return `/purchase/aesthetics/grn/${id}/quality`;
    if (row._grnType === 'FACTORY') return `/purchase/factory/inward/${id}/quality`;
    return `/purchase/grn/${id}/quality`;
  }},
  workOrder: { model: 'workOrder', field: 'woNo', href: () => `/purchase/work-orders` },
  salesOrder: { model: 'salesOrder', field: 'orderNo', href: () => `/sales/orders` },
  challan: { model: 'deliveryChallan', field: 'challanNo', href: () => `/sales/challans` },
  stockOutward: { model: 'stockOutward', field: 'outwardNo', href: () => `/inventory/stock-outward` },
  stockTransfer: { model: 'stockTransfer', field: 'transferNo', href: () => `/inventory/stock-transfers` },
  indent: { model: 'indent', field: 'indentNo', href: () => `/inventory/indents` },
  factoryIndent: { model: 'factoryIndent', field: 'indentNo', href: () => `/purchase/factory/indents` },
  assetPurchaseOrder: { model: 'assetPurchaseOrder', field: 'apoNo', href: () => `/purchase/asset-po/search` },
  permanentRefund: { model: 'permanentRefund', field: 'refundNo', href: () => `/billing/permanent-refunds` },
  physicalAudit: { model: 'physicalStockAudit', field: 'auditNo', href: () => `/inventory/physical-stock` },
  iou: { model: 'iOURequest', field: 'requestNo', href: () => `/operations/iou` },
  pettyCash: { model: 'pettyCash', field: 'entryNo', href: () => `/operations/petty-cash` },
  reimbursement: { model: 'reimbursementClaim', field: 'claimNo', href: () => `/operations/iou/reimbursement` },
  ticket: { model: 'ticket', field: 'ticketNo', href: () => `/operations/tickets` },
  appointment: { model: 'appointment', field: 'appointmentNo', href: (id) => `/appointments/${id}` },
  procedure: { model: 'procedure', field: 'procedureNo', href: (id) => `/appointments/procedures/${id}` },
  followUp: { model: 'followUp', field: 'id', href: (id) => `/call-center/follow-ups?followUpId=${id}` },
  visit: { model: 'customerVisit', field: 'visitNo', href: () => `/customer/treatment/visits` },
  product: { model: 'product', field: 'name', href: () => `/inventory/products` },
  kitMapping: { model: 'kitMapping', field: 'kitCode', href: () => `/master/kit-mapping` },
  clinicalTreatment: { model: 'clinicalTreatment', field: 'code', href: () => `/master/clinical-treatments` },
  asset: { model: 'asset', field: 'assetNo', href: () => `/inventory/assets/center-stock` },
  incentiveUpload: { model: 'incentiveUpload', field: 'id', href: () => `/finance/incentives` },
};

async function resolveLoanInstallmentIds(col, secondaryCol, rows) {
  const loanNos = [...new Set(rows.map((r) => r[col]).filter(Boolean))];
  if (!loanNos.length) return {};

  const loans = await prisma.loanAccount.findMany({
    where: { loanNo: { in: loanNos } },
    include: { installments: true },
  });

  const map = {};
  for (const row of rows) {
    const loan = loans.find((l) => l.loanNo === row[col]);
    if (!loan) continue;
    const instNo = parseInt(row[secondaryCol], 10);
    const inst = loan.installments.find((i) => i.installmentNo === instNo);
    if (inst) map[`${row[col]}:${row[secondaryCol]}`] = inst.id;
    else map[row[col]] = loan.id;
  }
  return map;
}

async function resolveEntityIds(entityKey, col, rows, secondaryCol) {
  if (entityKey === 'loanInstallment' && secondaryCol) {
    return resolveLoanInstallmentIds(col, secondaryCol, rows);
  }

  const config = ENTITIES[entityKey];
  if (!config || !rows.length) return {};

  const keys = [...new Set(rows.map((r) => r[col]).filter((v) => v != null && v !== '—'))];
  if (!keys.length) return {};

  const model = prisma[config.model];
  if (!model) return {};

  const where = entityKey === 'incentiveUpload'
    ? { id: { in: keys } }
    : { [config.field]: { in: keys } };

  const select = { id: true, [config.field]: true };
  if (entityKey === 'grn') select.grnType = true;
  if (entityKey === 'customerName') {
    const records = await prisma.customer.findMany({
      where: { OR: keys.flatMap((k) => {
        const parts = String(k).trim().split(/\s+/);
        return [{ firstName: parts[0] }, { lastName: parts.slice(1).join(' ') || parts[0] }];
      }) },
      select: { id: true, firstName: true, lastName: true },
      take: 200,
    });
    const map = {};
    for (const r of records) {
      map[`${r.firstName} ${r.lastName}`.trim()] = r.id;
      map[r.firstName] = r.id;
    }
    return map;
  }

  const records = await model.findMany({ where, select, take: 500 }).catch(() => []);
  const map = {};
  for (const r of records) {
    const key = entityKey === 'incentiveUpload' ? r.id : r[config.field];
    map[key] = { id: r.id, grnType: r.grnType };
  }
  return map;
}

function buildActionUrl(template, id, row, actionKey) {
  if (actionKey === 'grn-qc' && id) {
    if (row._grnType === 'AESTHETICS') return `/purchase/aesthetics/grn/${id}/quality`;
    if (row._grnType === 'FACTORY') return `/purchase/factory/inward/${id}/quality`;
    return `/purchase/grn/${id}/quality`;
  }
  return template
    .replace('{{id}}', id)
    .replace('{{customerId}}', row._customerId || id)
    .replace('{{phone}}', encodeURIComponent(row._phone || row.p || ''));
}

export async function enrichScreenData(screen, data) {
  if (!data.rows || screen.type === 'master') return data;

  const meta = mergeScreenMeta(screen.dataKey, REGISTRY_SCREEN_META[screen.dataKey] || {}, data.rows);
  const actions = [...(meta.actions || [])];
  if (screen.actions && !actions.includes(screen.actions)) {
    actions.push(screen.actions);
  }

  let rows = [...data.rows];

  if (meta.statusFilter) {
    rows = rows.filter((r) => r.s === meta.statusFilter || r.status === meta.statusFilter);
  }

  if (meta.entity && meta.col) {
    const idMap = await resolveEntityIds(meta.entity, meta.col, rows, meta.secondaryCol);
    rows = rows.map((row) => {
      const key = meta.secondaryCol ? `${row[meta.col]}:${row[meta.secondaryCol]}` : row[meta.col];
      const resolved = idMap[key] ?? idMap[row[meta.col]];
      const id = typeof resolved === 'object' ? resolved?.id : resolved;
      const grnType = typeof resolved === 'object' ? resolved?.grnType : null;
      const config = ENTITIES[meta.entity];
      const enriched = { ...row, _id: id || row._id, _phone: row.p || row.phone };
      if (grnType) enriched._grnType = grnType;
      if (id && config) {
        enriched._href = config.href(id, enriched);
        enriched._linkCol = meta.col;
      }
      return enriched;
    });
  } else {
    rows = rows.map((row) => ({ ...row, _id: row._id, _phone: row.p || row.phone }));
  }

  if (actions.length) {
    rows = rows.map((row) => ({
      ...row,
      _actions: actions
        .filter((a) => REGISTRY_ACTIONS[a])
        .map((a) => {
          const def = REGISTRY_ACTIONS[a];
          const id = row._id;
          if (!id && def.url.includes('{{id}}')) return null;
          return {
            key: a,
            label: def.label,
            method: def.method,
            url: buildActionUrl(def.url, id, row, a),
            confirm: def.confirm,
            style: def.style || 'primary',
            needsAction: def.needsAction,
          };
        })
        .filter(Boolean),
    }));
  }

  return {
    ...data,
    rows,
    portalRedirect: meta.portalRedirect,
    exportable: true,
  };
}

export function rowsToCsv(columns, rows) {
  const headers = columns.map((c) => c[0]);
  const keys = columns.map((c) => c[1]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(keys.map((k) => {
      const v = row[k];
      if (v == null) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  return lines.join('\n');
}
