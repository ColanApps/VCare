/**
 * Infers registry workflow metadata for screens without explicit REGISTRY_SCREEN_META.
 * Uses dataKey naming patterns and row column keys from the first data row.
 */

const FOLLOWUP_KEYS = new Set([
  'ccPendingAdvanceFu', 'ccRegularApptFu', 'ccTreatmentApptFu', 'ccNextSitting',
  'ccCallsFollowup', 'joinedFollowUp', 'procedureCompletedFu', 'rptCcFollowup',
]);

const COL_ENTITY_MAP = {
  b: { entity: 'bill', actions: ['view-bill', 'collect-payment'] },
  g: { entity: 'grn', actions: ['grn-qc'] },
  p: { entity: 'purchaseOrder', actions: ['po-auth'], altEntity: 'procedure', altActions: ['procedure-open'] },
  w: { entity: 'workOrder', actions: ['wo-auth'] },
  o: { entity: 'stockOutward', altEntity: 'salesOrder', altActions: ['view-sales-order'] },
  c: { entity: 'challan', altEntity: 'customerName', altActions: ['view-customer'] },
  i: { entity: 'indent', actions: ['indent-fulfill'], altEntity: 'iou' },
  t: { entity: 'stockTransfer', actions: ['transfer-approve'], altEntity: 'ticket', altActions: ['ticket-close'] },
  a: { entity: 'appointment', actions: ['view-appointment'], altEntity: 'asset', altActions: ['asset-barcode'] },
  pr: { entity: 'procedure', actions: ['procedure-open', 'procedure-start'] },
  l: { entity: 'loan', actions: ['loan-approve', 'view-loans'] },
  u: { entity: 'customerUhid', actions: ['view-customer'] },
  v: { entity: 'visit', actions: ['view-visit'] },
  s: { entity: 'stockTransfer' },
  e: { entity: 'pettyCash', actions: ['petty-approve'] },
};

function pickCol(row, candidates) {
  if (!row) return null;
  for (const c of candidates) {
    if (row[c] != null && row[c] !== '—') return c;
  }
  return null;
}

function resolveColEntity(dataKey, row) {
  if (!row) return null;

  if (FOLLOWUP_KEYS.has(dataKey) || /followup|follow-up|Fu$/i.test(dataKey)) {
    return { entity: 'followUp', col: row._id ? null : pickCol(row, ['c', 't']), actions: ['followup-complete', 'view-customer-fu'] };
  }

  if (/loan|installment|emi/i.test(dataKey)) {
    const col = pickCol(row, ['l', 'i', 'b']);
    if (col === 'i') return { entity: 'loanInstallment', col: 'l', secondaryCol: 'i', actions: ['pay-emi'] };
    return { entity: 'loan', col: col || 'l', actions: ['loan-approve', 'view-loans'] };
  }

  if (/bill|invoice|gst|pharmacy|archived|cancelled.*bill|sales.*invoice|b2b|b2c|processing.*fee|incentive.*package/i.test(dataKey)) {
    return { entity: 'bill', col: pickCol(row, ['b', 'i']) || 'b', actions: ['view-bill', 'collect-payment'] };
  }

  if (/grn|inward|received/i.test(dataKey)) {
    return { entity: 'grn', col: pickCol(row, ['g']) || 'g', actions: ['grn-qc'] };
  }

  if (/po|purchase.*order|authorize.*po/i.test(dataKey)) {
    const pending = row.s === 'PENDING' || row.s === 'DRAFT';
    return { entity: 'purchaseOrder', col: pickCol(row, ['p']) || 'p', actions: pending ? ['po-auth', 'view-po'] : ['view-po'] };
  }

  if (/work.?order|wo/i.test(dataKey)) {
    const pending = row.s === 'PENDING';
    return { entity: 'workOrder', col: pickCol(row, ['w']) || 'w', actions: pending ? ['wo-auth'] : [] };
  }

  if (/challan/i.test(dataKey)) {
    const cancel = /cancel/i.test(dataKey);
    return {
      entity: 'challan',
      col: pickCol(row, ['c']) || 'c',
      actions: cancel ? ['challan-cancel'] : ['view-challan'],
      statusFilter: cancel ? 'ISSUED' : undefined,
    };
  }

  if (/outward/i.test(dataKey)) {
    const pending = /pending/i.test(dataKey) || row.s === 'PENDING';
    return { entity: 'stockOutward', col: pickCol(row, ['o']) || 'o', actions: pending ? ['outward-auth'] : [] };
  }

  if (/indent|inward.*pending/i.test(dataKey)) {
    return { entity: 'indent', col: pickCol(row, ['i']) || 'i', actions: ['indent-fulfill'] };
  }

  if (/transfer/i.test(dataKey)) {
    const pending = row.s === 'PENDING';
    return { entity: 'stockTransfer', col: pickCol(row, ['t', 's']) || 't', actions: pending ? ['transfer-approve'] : [] };
  }

  if (/procedure|consent|performer|pre.*photo|post.*photo/i.test(dataKey)) {
    const pending = row.s === 'SCHEDULED' || row.s === 'PENDING';
    return {
      entity: 'procedure',
      col: pickCol(row, ['pr', 'p']) || 'pr',
      actions: pending ? ['procedure-open', 'procedure-start'] : ['procedure-open'],
    };
  }

  if (/appointment|scheduling|ccTreatmentAppts|onlineAppt/i.test(dataKey)) {
    return { entity: 'appointment', col: pickCol(row, ['a']) || 'a', actions: ['view-appointment', 'book-followup'] };
  }

  if (/customer|uhid|lead|referred|inactive|profile|visit|conversion/i.test(dataKey)) {
    const col = pickCol(row, ['u', 'c', 'p', 'v']);
    if (col === 'v') return { entity: 'visit', col: 'v', actions: ['view-visit'] };
    if (col === 'u') return { entity: 'customerUhid', col: 'u', actions: ['view-customer', 'schedule-appt'] };
    if (col === 'p' && /phone|sms|lead/i.test(dataKey)) return { entity: 'customerPhone', col: 'p', actions: ['view-customer', 'send-sms'] };
    return { entity: 'customerName', col: col || 'c', actions: ['view-customer', 'schedule-appt'] };
  }

  if (/iou|reimburse|petty|ticket|operations/i.test(dataKey)) {
    if (row.i && /iou|settle/i.test(dataKey)) return { entity: 'iou', col: 'i', actions: ['iou-settle'] };
    if (row.e) return { entity: 'pettyCash', col: 'e', actions: ['petty-approve'] };
    if (row.c && /reimburse/i.test(dataKey)) return { entity: 'reimbursement', col: 'c', actions: ['reimburse-approve'] };
    if (row.t) return { entity: 'ticket', col: 't', actions: ['ticket-close'] };
  }

  if (/incentive/i.test(dataKey)) {
    return { actions: ['incentive-process', 'incentive-payout'] };
  }

  if (/asset|barcode/i.test(dataKey)) {
    return { entity: 'asset', col: pickCol(row, ['a']) || 'a', actions: ['asset-barcode'] };
  }

  if (/sales.*order|order.*search/i.test(dataKey)) {
    return { entity: 'salesOrder', col: pickCol(row, ['o']) || 'o', actions: ['view-sales-order'] };
  }

  if (/credit|debit|refund/i.test(dataKey)) {
    return { entity: 'creditNote', col: pickCol(row, ['c']) || 'c', actions: ['view-credit-notes'] };
  }

  // Column-key fallback from first row
  for (const [col, spec] of Object.entries(COL_ENTITY_MAP)) {
    if (row[col] == null || row[col] === '—') continue;
    const useAlt = spec.altEntity && /customer|referred|joined/i.test(dataKey);
    return {
      entity: useAlt ? spec.altEntity : spec.entity,
      col,
      actions: useAlt ? spec.altActions : spec.actions,
    };
  }

  return null;
}

export function inferRegistryMeta(dataKey, rows = []) {
  const sample = rows[0];
  const inferred = resolveColEntity(dataKey, sample);
  if (!inferred) return {};

  const meta = { ...inferred };
  if (!meta.actions) meta.actions = [];
  if (sample?._id && meta.actions.includes('followup-complete')) {
    meta.entity = meta.entity || 'followUp';
  }
  return meta;
}

export function mergeScreenMeta(dataKey, explicitMeta, rows) {
  const inferred = inferRegistryMeta(dataKey, rows);
  const actions = [...new Set([...(explicitMeta.actions || []), ...(inferred.actions || [])])];
  return {
    ...inferred,
    ...explicitMeta,
    actions: actions.length ? actions : inferred.actions,
    entity: explicitMeta.entity || inferred.entity,
    col: explicitMeta.col || inferred.col,
  };
}
