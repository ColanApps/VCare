/**
 * Per dataKey metadata: entity resolution for drill-down links and workflow actions.
 * col = row field containing the lookup key; entity = ENTITIES key in registryDepthService.
 */
export const REGISTRY_SCREEN_META = {
  // Bills
  pharmacyBills: { entity: 'bill', col: 'b' },
  serviceB2bBills: { entity: 'bill', col: 'b' },
  archivedBills: { entity: 'bill', col: 'b' },
  cancelledBillsMonth: { entity: 'bill', col: 'b' },
  salesInvoices: { entity: 'bill', col: 'b' },
  salesInvoicesB2c: { entity: 'bill', col: 'b' },
  warehouseB2cInvoices: { entity: 'bill', col: 'b' },
  aestheticsInvoice: { entity: 'bill', col: 'b' },
  loanPaymentUpdate: { entity: 'loanInstallment', col: 'l', secondaryCol: 'i' },
  loanEstimate: { entity: 'loan', col: 'l', actions: ['loan-approve'] },
  installmentHub: { entity: 'loan', col: 'l' },
  rptProcessingFees: { entity: 'bill', col: 'b' },
  incentivePackage: { entity: 'bill', col: 'b' },
  gstInvoiceNos: { entity: 'bill', col: 'b' },
  gstCashReceipts: { entity: 'bill', col: 'b' },
  gstDebitNotes: { entity: 'creditNote', col: 'c' },
  gstSacSummary: { entity: 'bill', col: 'b' },
  gstSacDaywise: { entity: 'bill', col: 'b' },
  gstSacB2b: { entity: 'bill', col: 'b' },
  gstSacB2c: { entity: 'bill', col: 'b' },

  // Customers
  inactiveCustomers: { entity: 'customerUhid', col: 'u' },
  uhidMapping: { entity: 'customerUhid', col: 'u' },
  newLead: { entity: 'customerPhone', col: 'p' },
  rptProfileHistory: { entity: 'customerUhid', col: 'u' },
  rptReferred: { entity: 'customerName', col: 'c' },
  rptCustomerVisits: { entity: 'visit', col: 'v' },
  joinedCustomerFeedback: { entity: 'customerName', col: 'c' },
  portalConsultantPhotos: { entity: 'customerName', col: 'c' },

  // Purchase / GRN
  grnReceived: { entity: 'grn', col: 'g' },
  poAuthorizationDash: { entity: 'purchaseOrder', col: 'p', actions: ['po-auth'] },
  poSearch: { entity: 'purchaseOrder', col: 'p' },
  woAuthorize: { entity: 'workOrder', col: 'w', actions: ['wo-auth'] },
  aestheticsGrn: { entity: 'grn', col: 'g' },
  factoryInward: { entity: 'grn', col: 'g' },
  factoryInwardQuality: { entity: 'grn', col: 'g', actions: ['grn-qc'] },
  factoryInwardReport: { entity: 'grn', col: 'g' },
  factoryIndentSearch: { entity: 'factoryIndent', col: 'i' },
  assetPoSearch: { entity: 'assetPurchaseOrder', col: 'a' },
  assetPoPending: { entity: 'assetPurchaseOrder', col: 'a', statusFilter: 'PENDING_AUTH' },
  rptPermanentRefunds: { entity: 'permanentRefund', col: 'r', actions: ['refund-approve'], statusFilter: 'PENDING' },

  // Sales
  salesOrderSearch: { entity: 'salesOrder', col: 'o' },
  challanSearch: { entity: 'challan', col: 'c' },
  challanCancel: { entity: 'challan', col: 'c', actions: ['challan-cancel'], statusFilter: 'ISSUED' },

  // Inventory
  stockOutwardPending: { entity: 'stockOutward', col: 'o', actions: ['outward-auth'] },
  stockOutwardSearch: { entity: 'stockOutward', col: 'o' },
  warehouseTransfer: { entity: 'stockTransfer', col: 't', actions: ['transfer-approve'] },
  rptStockTransfer: { entity: 'stockTransfer', col: 's' },
  inwardPendingBillable: { entity: 'indent', col: 'i', actions: ['indent-fulfill'] },
  inwardPendingClinical: { entity: 'indent', col: 'i', actions: ['indent-fulfill'] },
  indentPendingProducts: { entity: 'indent', col: 'i' },
  physicalStockSearch: { entity: 'physicalAudit', col: 'a' },

  // Operations
  iouSettlement: { entity: 'iou', col: 'i', actions: ['iou-settle'] },
  iouPendingApproval: { entity: 'iou', col: 'i', actions: ['iou-approve', 'iou-reject'] },
  pettyCashApproval: { entity: 'pettyCash', col: 'e', actions: ['petty-approve', 'petty-reject'] },
  reimbursementApproval: { entity: 'reimbursement', col: 'c', actions: ['reimburse-approve', 'reimburse-reject'] },
  operationsIssues: { entity: 'ticket', col: 't', actions: ['ticket-close'] },

  // Appointments / procedures
  consultantAppointments: { entity: 'appointment', col: 'a' },
  onlineAppointments: { entity: 'appointment', col: 'a' },
  procedurePending: { entity: 'procedure', col: 'pr', actions: ['procedure-start'] },
  procedureBookingReport: { entity: 'procedure', col: 'pr' },
  procedureFormList: { entity: 'procedure', col: 'pr', actions: ['procedure-open'] },
  procedureConsentList: { entity: 'procedure', col: 'pr', actions: ['procedure-consent'] },
  preProcedurePhotos: { entity: 'procedure', col: 'pr' },
  postProcedurePhotos: { entity: 'procedure', col: 'pr' },
  performerCalendar: { entity: 'procedure', col: 'pr' },
  treatmentStatusReport: { entity: 'procedure', col: 'p' },

  // Follow-ups (call center)
  ccPendingAdvanceFu: { actions: ['followup-complete'] },
  ccRegularApptFu: { actions: ['followup-complete'] },
  ccTreatmentApptFu: { actions: ['followup-complete'] },
  ccNextSitting: { actions: ['followup-complete'] },
  ccCallsFollowup: { actions: ['followup-complete'] },
  joinedFollowUp: { actions: ['followup-complete'] },
  procedureCompletedFu: { actions: ['followup-complete'] },
  rptCcFollowup: { actions: ['followup-complete'] },

  // Incentives
  incentiveUpload: { actions: ['incentive-process'] },

  // Portal (redirect handled separately — branch-manager & warehouse use dedicated routes)
  portalConsultantPhotos: { portalRedirect: '/portal/consultant' },
  portalConsultantTrichoscan: { portalRedirect: '/portal/consultant' },
  portalAccountsInflow: { portalRedirect: '/portal/accounts' },
  portalCorpWhStock: { portalRedirect: '/portal/corporate' },

  // Master-like reports with edit
  productTaxMaster: { entity: 'product', col: 'p', actions: ['product-tax-edit'] },
  advanceKitMaster: { actions: ['kit-edit'] },
  productMappingMaster: { actions: ['kit-edit'] },
  clinicalServiceMaster: { actions: ['clinical-edit'] },
  assetBarcodeList: { entity: 'asset', col: 'a', actions: ['asset-barcode'] },

  // CC actionable
  ccLeadUpload: { actions: ['lead-upload-form'] },
  ccSmsLog: { entity: 'customerPhone', col: 'p', actions: ['send-sms'] },
};

/** Screens using screen.actions field (legacy) — merged at runtime */
export const LEGACY_SCREEN_ACTIONS = {
  'iou-settle': { method: 'POST', url: '/registry/actions/iou-settle', idField: '_id' },
  'petty-approve': { method: 'POST', url: '/registry/actions/petty-approve', idField: '_id', needsAction: true },
  'reimburse-approve': { method: 'POST', url: '/registry/actions/reimburse-approve', idField: '_id' },
};

export const REGISTRY_ACTIONS = {
  'outward-auth': { label: 'Authorize', method: 'POST', url: '/registry/actions/stock-outward/{{id}}/authorize', confirm: 'Authorize stock outward?' },
  'wo-auth': { label: 'Authorize', method: 'POST', url: '/registry/actions/work-order/{{id}}/authorize', confirm: 'Authorize work order?' },
  'po-auth': { label: 'Authorize', method: 'POST', url: '/registry/actions/po/{{id}}/authorize', confirm: 'Approve PO?' },
  'loan-approve': { label: 'Approve', method: 'POST', url: '/registry/actions/loan/{{id}}/approve', confirm: 'Approve loan?' },
  'challan-cancel': { label: 'Cancel', method: 'POST', url: '/registry/actions/challan/{{id}}/cancel', confirm: 'Cancel delivery challan?', style: 'danger' },
  'transfer-approve': { label: 'Approve', method: 'POST', url: '/registry/actions/transfer/{{id}}/approve', confirm: 'Approve transfer?' },
  'indent-fulfill': { label: 'Fulfill', method: 'POST', url: '/registry/actions/indent/{{id}}/fulfill', confirm: 'Mark indent fulfilled?' },
  'grn-qc': { label: 'QC', method: 'GET', url: '/purchase/grn/{{id}}/quality' },
  'procedure-open': { label: 'Open', method: 'GET', url: '/appointments/procedures/{{id}}' },
  'procedure-start': { label: 'Start', method: 'POST', url: '/registry/actions/procedure/{{id}}/start', confirm: 'Start procedure?' },
  'procedure-consent': { label: 'Consent', method: 'GET', url: '/appointments/procedures/{{id}}' },
  'followup-complete': { label: 'Complete', method: 'POST', url: '/registry/actions/followup/{{id}}/complete', confirm: 'Mark follow-up complete?' },
  'ticket-close': { label: 'Close', method: 'POST', url: '/registry/actions/ticket/{{id}}/close', confirm: 'Close ticket?' },
  'incentive-process': { label: 'Calculate', method: 'POST', url: '/registry/actions/incentive/{{id}}/process', confirm: 'Calculate incentives for this period?' },
  'product-tax-edit': { label: 'Edit Tax', method: 'GET', url: '/registry/forms/product-tax/{{id}}' },
  'kit-edit': { label: 'Edit', method: 'GET', url: '/registry/forms/kit/{{id}}' },
  'clinical-edit': { label: 'Edit', method: 'GET', url: '/registry/forms/clinical/{{id}}' },
  'asset-barcode': { label: 'Barcode', method: 'POST', url: '/registry/actions/asset/{{id}}/barcode', confirm: 'Generate barcode?' },
  'iou-settle': { label: 'Settle', method: 'POST', url: '/registry/actions/iou/{{id}}/settle', confirm: 'Settle IOU?' },
  'iou-approve': { label: 'Approve', method: 'POST', url: '/registry/actions/iou/{{id}}/approve', confirm: 'Approve IOU request?' },
  'iou-reject': { label: 'Reject', method: 'POST', url: '/registry/actions/iou/{{id}}/approve', needsAction: true, style: 'danger' },
  'petty-approve': { label: 'Approve', method: 'POST', url: '/registry/actions/petty/{{id}}/approve', needsAction: true },
  'petty-reject': { label: 'Reject', method: 'POST', url: '/registry/actions/petty/{{id}}/approve', needsAction: true, style: 'danger' },
  'reimburse-approve': { label: 'Approve', method: 'POST', url: '/registry/actions/reimbursement/{{id}}/approve', confirm: 'Approve claim?' },
  'reimburse-reject': { label: 'Reject', method: 'POST', url: '/registry/actions/reimbursement/{{id}}/approve', needsAction: true, style: 'danger' },
  'refund-approve': { label: 'Approve', method: 'POST', url: '/billing/permanent-refunds/{{id}}/approve', confirm: 'Approve permanent refund and post ledger entries?' },
  'send-sms': { label: 'SMS', method: 'GET', url: '/registry/forms/sms?phone={{phone}}' },
  'lead-upload-form': { label: 'Upload Leads', method: 'GET', url: '/registry/forms/lead-upload' },
  'view-bill': { label: 'View', method: 'GET', url: '/billing/{{id}}' },
  'collect-payment': { label: 'Collect', method: 'GET', url: '/billing/{{id}}', style: 'success' },
  'view-customer': { label: 'Customer', method: 'GET', url: '/customer/{{id}}' },
  'view-customer-fu': { label: 'Customer', method: 'GET', url: '/customer/{{customerId}}' },
  'schedule-appt': { label: 'Book', method: 'GET', url: '/appointments/create?customerId={{id}}' },
  'view-appointment': { label: 'Open', method: 'GET', url: '/appointments/{{id}}' },
  'book-followup': { label: 'Follow-up', method: 'GET', url: '/call-center/follow-ups/pending-advance' },
  'view-loans': { label: 'Loans', method: 'GET', url: '/billing/loans' },
  'pay-emi': { label: 'Pay EMI', method: 'GET', url: '/billing/loans' },
  'view-po': { label: 'PO', method: 'GET', url: '/purchase/orders' },
  'view-challan': { label: 'Challan', method: 'GET', url: '/sales/challans' },
  'view-sales-order': { label: 'Order', method: 'GET', url: '/sales/orders' },
  'view-visit': { label: 'Visit', method: 'GET', url: '/customer/treatment/visits' },
  'view-credit-notes': { label: 'Credits', method: 'GET', url: '/billing/credit-notes' },
  'incentive-payout': { label: 'Payouts', method: 'GET', url: '/finance/incentives' },
};
