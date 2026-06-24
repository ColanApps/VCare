/**
 * Registry of requirement screens not covered by dedicated route files.
 * Each entry is served by /screens router with generic templates + screenDataService.
 */
export const _registryScreensRaw = [
  // ─── Master ───────────────────────────────────────────────────────────────
  { id: 'master-courier', path: '/master/courier', title: 'Courier Master', module: 'master', permission: 'master.reference', type: 'master', model: 'courier', fields: ['code', 'name', 'contact', 'phone'] },
  { id: 'master-transporter', path: '/master/transporters', title: 'Transporter Master', module: 'master', permission: 'master.reference', type: 'master', model: 'transporter', fields: ['code', 'name', 'contact', 'phone', 'gstin'] },
  { id: 'master-delivery-at', path: '/master/delivery-at', title: 'Delivery At Master', module: 'master', permission: 'master.reference', type: 'master', model: 'deliveryAt', fields: ['code', 'name', 'address'] },
  { id: 'master-ot', path: '/master/ot', title: 'OT Master', module: 'master', permission: 'master.reference', type: 'master', model: 'oTMaster', fields: ['code', 'name'] },
  { id: 'master-banners', path: '/master/banners', title: 'Banner Master', module: 'master', permission: 'master.reference', type: 'master', model: 'banner', fields: ['title', 'category'] },
  { id: 'master-clinical-treatments', path: '/master/clinical-treatments', title: 'Clinical Treatment Master', module: 'master', permission: 'master.treatments', type: 'master', model: 'clinicalTreatment', fields: ['code', 'name', 'category', 'basePrice'] },
  { id: 'master-therapist-incentives', path: '/master/therapist-incentives', title: 'Therapist Incentive Master', module: 'master', permission: 'master.targets', type: 'master', model: 'therapistIncentiveRule', fields: ['category', 'ratePercent', 'flatAmount'] },
  { id: 'master-procedure-consumption', path: '/master/procedure-consumption', title: 'Procedure Consumption Master', module: 'master', permission: 'master.treatments', type: 'report', dataKey: 'procedureConsumption' },
  { id: 'master-consultant-targets', path: '/master/targets/consultants', title: 'Consultant Targets', module: 'master', permission: 'master.targets', type: 'report', dataKey: 'consultantTargets' },
  { id: 'master-location-target-day', path: '/master/targets/location-day', title: 'Location Target — Day', module: 'master', permission: 'master.targets', type: 'report', dataKey: 'locationTargetDay' },
  { id: 'master-consultant-target-day', path: '/master/targets/consultant-day', title: 'Consultant Target — Day', module: 'master', permission: 'master.targets', type: 'report', dataKey: 'consultantTargetDay' },
  { id: 'master-heads-targets', path: '/master/targets/heads', title: 'Heads Target', module: 'master', permission: 'master.targets', type: 'report', dataKey: 'headsTargets' },
  { id: 'master-cc-location-targets', path: '/master/call-center/location-targets', title: 'CC Location Target', module: 'master', permission: 'master.targets', type: 'report', dataKey: 'ccLocationTargets' },
  { id: 'master-cc-agent-targets', path: '/master/call-center/agent-targets', title: 'CC Agent Target', module: 'master', permission: 'master.targets', type: 'report', dataKey: 'ccAgentTargets' },
  { id: 'master-kit-mapping', path: '/master/kit-mapping', title: 'Kit Mapping', module: 'master', permission: 'master.reference', type: 'master', model: 'kitMapping', fields: ['kitCode', 'name', 'mapType', 'itemsJson'] },

  // ─── Customer / Billing ─────────────────────────────────────────────────────
  { id: 'customer-inactive', path: '/customer/inactive', title: 'Customer In-Active', module: 'customer', permission: 'customer.view', type: 'report', dataKey: 'inactiveCustomers' },
  { id: 'customer-refund-complaints', path: '/customer/refund-complaints', title: 'Refund Complaints', module: 'customer', permission: 'billing.refunds', type: 'master', model: 'refundComplaint', fields: ['complaintNo', 'customerId', 'complaint'] },
  { id: 'customer-hma-status', path: '/customer/treatment/hma-status', title: 'HMA Status Report', module: 'customer', permission: 'customer.treatment', type: 'report', dataKey: 'hmaStatus' },
  { id: 'customer-dsa-status', path: '/customer/treatment/dsa-status', title: 'DSA Status Report', module: 'customer', permission: 'customer.treatment', type: 'report', dataKey: 'dsaStatus' },
  { id: 'billing-pharmacy-view', path: '/billing/pharmacy/view', title: 'Pharmacy Bill View', module: 'billing', permission: 'billing.pharmacy', type: 'report', dataKey: 'pharmacyBills' },
  { id: 'billing-service-b2b-search', path: '/billing/service-b2b/search', title: 'Service B2B Invoice Search', module: 'billing', permission: 'billing.service.b2b', type: 'report', dataKey: 'serviceB2bBills' },
  { id: 'billing-archive', path: '/billing/archive', title: 'Bill Details (Archive)', module: 'billing', permission: 'billing.view', type: 'report', dataKey: 'archivedBills' },
  { id: 'billing-cancellations', path: '/billing/cancellations', title: 'Bill Cancel — Current Month', module: 'billing', permission: 'billing.cancel', type: 'report', dataKey: 'cancelledBillsMonth' },
  { id: 'billing-installments-hub', path: '/billing/installments', title: 'Installment Hub', module: 'billing', permission: 'billing.installments', type: 'report', dataKey: 'installmentHub' },
  { id: 'billing-loan-payment-update', path: '/billing/loans/payment-update', title: 'Loan Payment Update', module: 'billing', permission: 'billing.loans', type: 'report', dataKey: 'loanPaymentUpdate' },

  // ─── Appointments ───────────────────────────────────────────────────────────
  { id: 'appt-fix-new', path: '/appointments/fix-new', title: 'Fix New Appointment', module: 'appointments', permission: 'appointments.create', type: 'form', dataKey: 'fixNewAppointment' },
  { id: 'appt-consultant-search', path: '/appointments/consultant-search', title: 'Consultant Appointment Search', module: 'appointments', permission: 'appointments.view', type: 'report', dataKey: 'consultantAppointments' },
  { id: 'appt-online', path: '/appointments/online', title: 'Online Appointments', module: 'appointments', permission: 'appointments.view', type: 'report', dataKey: 'onlineAppointments' },
  { id: 'appt-treatment-status', path: '/appointments/treatment-status', title: 'Treatment Status Report', module: 'appointments', permission: 'appointments.view', type: 'report', dataKey: 'treatmentStatusReport' },
  { id: 'appt-performer-calendar', path: '/appointments/procedures/performer-calendar', title: 'Performer Calendar', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'performerCalendar' },
  { id: 'appt-procedure-pending', path: '/reports/procedure-pending', title: 'Procedure Pending Report', module: 'reports', permission: 'appointments.procedures', type: 'report', dataKey: 'procedurePending' },
  { id: 'appt-procedure-booking', path: '/reports/procedure-booking', title: 'Procedure Booking Report', module: 'reports', permission: 'appointments.procedures', type: 'report', dataKey: 'procedureBookingReport' },

  // ─── Call Center ──────────────────────────────────────────────────────────
  { id: 'cc-treatment-appts', path: '/call-center/treatment-appointments', title: 'Treatment Appointments', module: 'callcenter', permission: 'callcenter.view', type: 'report', dataKey: 'ccTreatmentAppts' },
  { id: 'cc-pending-advance-fu', path: '/call-center/follow-ups/pending-advance', title: 'Pending Advance Follow-Up', module: 'callcenter', permission: 'callcenter.followup', type: 'report', dataKey: 'ccPendingAdvanceFu' },
  { id: 'cc-regular-appt-fu', path: '/call-center/follow-ups/regular-appointment', title: 'Regular Appointment Follow-Up', module: 'callcenter', permission: 'callcenter.followup', type: 'report', dataKey: 'ccRegularApptFu' },
  { id: 'cc-treatment-appt-fu', path: '/call-center/follow-ups/treatment-appointment', title: 'Treatment Appointment Follow-Up', module: 'callcenter', permission: 'callcenter.followup', type: 'report', dataKey: 'ccTreatmentApptFu' },
  { id: 'cc-next-sitting', path: '/call-center/follow-ups/next-sitting', title: 'Next Sitting Follow-Up', module: 'callcenter', permission: 'callcenter.followup', type: 'report', dataKey: 'ccNextSitting' },
  { id: 'cc-calls-followup', path: '/call-center/calls-followup', title: 'Calls Followup', module: 'callcenter', permission: 'callcenter.followup', type: 'report', dataKey: 'ccCallsFollowup' },
  { id: 'cc-dialer', path: '/call-center/dialer', title: 'Dialer Dashboard', module: 'callcenter', permission: 'callcenter.view', type: 'dashboard', dataKey: 'dialerDashboard' },

  // ─── Purchase / Sales ─────────────────────────────────────────────────────
  { id: 'purchase-transporters', path: '/purchase/transporters', title: 'Transporter (Purchase)', module: 'purchase', permission: 'purchase.vendors', type: 'master', model: 'transporter', fields: ['code', 'name', 'phone', 'gstin'] },
  { id: 'purchase-delivery-at', path: '/purchase/delivery-at', title: 'Delivery At', module: 'purchase', permission: 'purchase.vendors', type: 'master', model: 'deliveryAt', fields: ['code', 'name', 'address'] },
  { id: 'purchase-grn-received', path: '/purchase/grn/received', title: 'GRN Received Products', module: 'purchase', permission: 'purchase.grn', type: 'report', dataKey: 'grnReceived' },
  { id: 'purchase-sto-pending', path: '/purchase/sto/pending', title: 'Indent Pending Products', module: 'purchase', permission: 'purchase.po', type: 'report', dataKey: 'indentPendingProducts' },
  { id: 'purchase-wo-authorize', path: '/purchase/work-orders/authorize', title: 'WO Authorization', module: 'purchase', permission: 'purchase.workorder', type: 'report', dataKey: 'woAuthorize' },
  // ─── Aesthetics (dedicated workflow routes) ───────────────────────────────
  // { id: 'aesthetics-po', ... } — see purchaseWorkflows.js

  // ─── Factory indent / inward (dedicated workflow routes) ──────────────────
  // { id: 'factory-inward', ... } — see purchaseWorkflows.js

  { id: 'purchase-factory-indents-registry', path: '/purchase/factory/indents/registry-legacy', title: 'Factory Indents (Legacy)', module: 'purchase', permission: 'purchase.po', type: 'master', model: 'factoryIndent', fields: ['indentNo', 'notes'] },
  { id: 'purchase-asset-po', path: '/purchase/asset-po', title: 'Asset Purchase Orders', module: 'purchase', permission: 'purchase.authorize', type: 'master', model: 'assetPurchaseOrder', fields: ['apoNo', 'totalAmount', 'notes'] },
  { id: 'sales-orders-search', path: '/sales/orders/search', title: 'Sales Order Search', module: 'sales', permission: 'sales.view', type: 'report', dataKey: 'salesOrderSearch' },
  { id: 'sales-challans-search', path: '/sales/challans/search', title: 'Delivery Challan Search', module: 'sales', permission: 'sales.view', type: 'report', dataKey: 'challanSearch' },
  { id: 'sales-invoices', path: '/sales/invoices', title: 'Sales Invoices', module: 'sales', permission: 'sales.invoice', type: 'report', dataKey: 'salesInvoices' },
  { id: 'sales-invoices-b2c', path: '/sales/invoices/b2c', title: 'Sales Invoice (B2C)', module: 'sales', permission: 'sales.invoice', type: 'report', dataKey: 'salesInvoicesB2c' },

  // ─── Inventory ────────────────────────────────────────────────────────────
  { id: 'inv-inward-billable', path: '/inventory/inward/billable/search', title: 'Stock Inward Search (Billable)', module: 'inventory', permission: 'inventory.stock', type: 'report', dataKey: 'inwardBillable' },
  { id: 'inv-inward-clinical', path: '/inventory/inward/clinical/search', title: 'Stock Inward Search (Clinical)', module: 'inventory', permission: 'inventory.clinical', type: 'report', dataKey: 'inwardClinical' },
  { id: 'inv-inward-pending-billable', path: '/inventory/inward/billable/pending', title: 'Inward Pending (Billable)', module: 'inventory', permission: 'inventory.indent', type: 'report', dataKey: 'inwardPendingBillable' },
  { id: 'inv-inward-pending-clinical', path: '/inventory/inward/clinical/pending', title: 'Inward Pending (Clinical)', module: 'inventory', permission: 'inventory.indent', type: 'report', dataKey: 'inwardPendingClinical' },
  { id: 'inv-physical-search', path: '/inventory/physical-stock/search', title: 'Physical Stock Search', module: 'inventory', permission: 'inventory.stock', type: 'report', dataKey: 'physicalStockSearch' },
  { id: 'inv-asset-center', path: '/inventory/assets/center-stock', title: 'Asset Center Stock', module: 'inventory', permission: 'inventory.stock', type: 'report', dataKey: 'assetCenterStock' },
  { id: 'inv-asset-outward', path: '/inventory/assets/outward', title: 'Asset Outward', module: 'inventory', permission: 'inventory.outward', type: 'report', dataKey: 'assetOutward' },
  { id: 'inv-batches-billable', path: '/purchase/batches/billable', title: 'Billable Batch Master', module: 'purchase', permission: 'purchase.vendors', type: 'master', model: 'productBatch', fields: ['productId', 'batchNo', 'stockType', 'expiryDate'] },

  // ─── Operations ───────────────────────────────────────────────────────────
  { id: 'ops-dtr', path: '/operations/dtr', title: 'DTR Entry & Display', module: 'operations', permission: 'operations.petty', type: 'master', model: 'dTRRecord', fields: ['dtrNo', 'openingCash', 'closingCash', 'notes'] },
  { id: 'ops-manpower', path: '/operations/manpower', title: 'Manpower Requisition', module: 'operations', permission: 'operations.tickets', type: 'master', model: 'manpowerRequisition', fields: ['reqNo', 'designation', 'headcount', 'reason'] },
  { id: 'ops-investment', path: '/operations/investment', title: 'Investment', module: 'operations', permission: 'operations.iou', type: 'master', model: 'investment', fields: ['invNo', 'category', 'amount', 'description'] },
  { id: 'ops-new-joinee', path: '/operations/new-joinee', title: 'New Joinee Form', module: 'operations', permission: 'operations.tickets', type: 'master', model: 'newJoinee', fields: ['employeeId', 'firstName', 'lastName', 'designation'] },
  { id: 'ops-iou-settlement', path: '/operations/iou/settlement', title: 'IOU Settlement', module: 'operations', permission: 'operations.iou', type: 'report', dataKey: 'iouSettlement', actions: 'iou-settle' },
  { id: 'ops-iou-approve', path: '/operations/iou/approve', title: 'IOU Approval', module: 'operations', permission: 'operations.iou', type: 'report', dataKey: 'iouPendingApproval', actions: 'iou-approve' },
  { id: 'ops-reimbursement', path: '/operations/iou/reimbursement', title: 'Reimbursement (Claim)', module: 'operations', permission: 'operations.iou', type: 'master', model: 'reimbursementClaim', fields: ['claimNo', 'amount', 'purpose'] },
  { id: 'ops-petty-approve', path: '/operations/petty-cash/approve', title: 'Petty Cash Approval', module: 'operations', permission: 'operations.petty', type: 'report', dataKey: 'pettyCashApproval', actions: 'petty-approve' },
  { id: 'ops-hma-status', path: '/operations/hma-status', title: 'HMA Status', module: 'operations', permission: 'operations.tickets', type: 'report', dataKey: 'hmaStatusOps' },
  { id: 'ops-it-assets', path: '/operations/it-assets', title: 'IT Assets', module: 'operations', permission: 'operations.tickets', type: 'report', dataKey: 'itAssets' },
  { id: 'ops-issues', path: '/operations/issues', title: 'Operations Issues', module: 'operations', permission: 'operations.tickets', type: 'report', dataKey: 'operationsIssues' },
  { id: 'ops-documents', path: '/operations/documents', title: 'Documents', module: 'operations', permission: 'operations.tickets', type: 'master', model: 'documentStore', fields: ['title', 'category'] },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  { id: 'dash-visits', path: '/dashboard/visits', title: 'Visits — All', module: 'dashboard', permission: 'dashboard.treatment', type: 'report', dataKey: 'dashboardVisits' },
  { id: 'dash-branch-conversion', path: '/dashboard/branch/conversion', title: 'Conversion Dashboard', module: 'dashboard', permission: 'dashboard.branch', type: 'dashboard', dataKey: 'branchConversion' },
  { id: 'dash-branch-appts', path: '/dashboard/branch/appointments', title: 'Appointment Analytics', module: 'dashboard', permission: 'dashboard.branch', type: 'dashboard', dataKey: 'branchAppointments' },
  { id: 'dash-before-after', path: '/dashboard/before-after-album', title: 'Before-After Album', module: 'dashboard', permission: 'dashboard.treatment', type: 'report', dataKey: 'beforeAfterAlbum' },
  { id: 'dash-po-auth', path: '/dashboard/po-authorization', title: 'PO Authorization', module: 'dashboard', permission: 'dashboard.view', type: 'report', dataKey: 'poAuthorizationDash' },
  { id: 'dash-inflow-hair-skin', path: '/dashboard/inflow/hair-skin', title: 'Inflow — Hair & Skin', module: 'dashboard', permission: 'dashboard.inflow', type: 'dashboard', dataKey: 'inflowHairSkin' },
  { id: 'dash-day-sales-hair', path: '/dashboard/day-sales/hair', title: 'Day Sales — Hair', module: 'dashboard', permission: 'dashboard.sales', type: 'report', dataKey: 'daySalesHair' },
  { id: 'dash-day-sales-skin', path: '/dashboard/day-sales/skin', title: 'Day Sales — Skin', module: 'dashboard', permission: 'dashboard.sales', type: 'report', dataKey: 'daySalesSkin' },

  // ─── Reports — Tracking ───────────────────────────────────────────────────
  { id: 'rpt-customer-photos', path: '/reports/tracking/customer-photos', title: 'Customer Photos Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptCustomerPhotos' },
  { id: 'rpt-scheduling-status', path: '/reports/tracking/scheduling-status', title: 'Scheduling Status', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptSchedulingStatus' },
  { id: 'rpt-sales-comparison', path: '/reports/tracking/sales-comparison', title: 'Sales Comparison', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptSalesComparison' },
  { id: 'rpt-slip-feedback', path: '/reports/tracking/treatment-slip-feedback', title: 'Treatment Slip & Feedback', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptSlipFeedback' },
  { id: 'rpt-profile-history', path: '/reports/tracking/profile-history', title: 'Customer Profile History', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptProfileHistory' },
  { id: 'rpt-supplements', path: '/reports/tracking/supplements', title: 'Supplement Product Report', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptSupplements' },
  { id: 'rpt-prescriptions', path: '/reports/tracking/prescriptions', title: 'Consultant Treatment Prescription', module: 'reports', permission: 'reports.consultants', type: 'report', dataKey: 'rptPrescriptions' },

  // ─── Reports — Customer / Sales / Treatment ───────────────────────────────
  { id: 'rpt-customer-visits', path: '/reports/customers/visits', title: 'Customer Visit Details', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptCustomerVisits' },
  { id: 'rpt-permanent-refunds', path: '/reports/customers/permanent-refunds', title: 'Permanent Refund Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptPermanentRefunds' },
  { id: 'rpt-referred', path: '/reports/customers/referred', title: 'Referred Customers', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptReferred' },
  { id: 'rpt-conversion', path: '/reports/customers/conversion', title: 'Customer Conversion', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptConversion' },
  { id: 'rpt-sales-summary', path: '/reports/sales/summary', title: 'Sales Summary', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptSalesSummary' },
  { id: 'rpt-sales-day-consolidated', path: '/reports/sales/day-wise-consolidated', title: 'Day Wise Sales Consolidated', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptDaySalesConsolidated' },
  { id: 'rpt-consultant-cumulative', path: '/reports/sales/consultant-cumulative-collection', title: 'Consultant Cumulative Collection', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptConsultantCumulative' },
  { id: 'rpt-processing-fees', path: '/reports/processing-fees', title: 'Processing Fee Report', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptProcessingFees' },
  { id: 'rpt-trichology', path: '/reports/treatment/trichology-diagnosis', title: 'Trichology Diagnosis', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptTrichology' },
  { id: 'rpt-conversion-detail', path: '/reports/treatment/conversion-detail', title: 'Conversion Detail', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptConversionDetail' },
  { id: 'rpt-stock-transfer', path: '/reports/stock-transfer', title: 'Stock Transfer Report', module: 'reports', permission: 'reports.inventory', type: 'report', dataKey: 'rptStockTransfer' },
  { id: 'rpt-closing-stock', path: '/reports/closing-stock', title: 'Closing Stock Report', module: 'reports', permission: 'reports.inventory', type: 'report', dataKey: 'rptClosingStock' },
  { id: 'rpt-clinical-consumption', path: '/reports/clinical-consumption', title: 'Clinical Consumption Report', module: 'reports', permission: 'reports.inventory', type: 'report', dataKey: 'rptClinicalConsumption' },

  // ─── Reports — Call Center / Audit / Incentives ───────────────────────────
  { id: 'rpt-cc-followup', path: '/reports/call-center/follow-up', title: 'Customer Follow-Up Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptCcFollowup' },
  { id: 'rpt-cc-visits-comparison', path: '/reports/call-center/visits-comparison', title: 'Visits Comparison', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptVisitsComparison' },
  { id: 'rpt-call-audit-live', path: '/reports/call-audit/live', title: 'Live Call Audit', module: 'reports', permission: 'reports.customers', type: 'master', model: 'callAudit', fields: ['auditNo', 'callType', 'score', 'findings'] },
  { id: 'rpt-call-audit-regular', path: '/reports/call-audit/regular', title: 'Regular Audits', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'callAuditRegular' },
  { id: 'rpt-incentive-procedures', path: '/reports/incentives/procedures', title: 'Procedure Incentive', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentiveProcedures' },
  { id: 'rpt-incentive-package', path: '/reports/incentives/package-upgrade', title: 'Package & Upgrade Incentive', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentivePackage' },
  { id: 'rpt-incentive-upload', path: '/reports/incentives/upload', title: 'Incentive Upload', module: 'reports', permission: 'reports.incentives', type: 'master', model: 'incentiveUpload', fields: ['periodMonth', 'periodYear', 'notes'] },

  // ─── Reports — GST gaps ───────────────────────────────────────────────────
  { id: 'rpt-gst-invoice-nos', path: '/reports/gst/invoice-numbers', title: 'GST Invoice No Report', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstInvoiceNos' },
  { id: 'rpt-gst-cash-receipts', path: '/reports/gst/cash-receipts', title: 'Cash Receipts Voucher', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstCashReceipts' },
  { id: 'rpt-gst-debit-notes', path: '/reports/gst/debit-notes', title: 'Debit Note Report', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstDebitNotes' },
  { id: 'rpt-gst-purchase-hsn', path: '/reports/gst/hsn/purchase', title: 'Purchase Report (HSN)', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstPurchaseHsn' },

  // ─── Reports — Meeting (consolidated) ─────────────────────────────────────
  { id: 'rpt-meeting-daily-status', path: '/reports/meetings/daily-status', title: 'Daily Status Report', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingDailyStatus' },
  { id: 'rpt-meeting-new-regular', path: '/reports/meetings/new-regular-sales', title: 'New & Regular Sales', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingNewRegular' },
  { id: 'rpt-meeting-fy-sales', path: '/reports/meetings/fy-sales', title: 'FY Month Sales', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingFySales' },
  { id: 'rpt-meeting-annual-conversion', path: '/reports/meetings/annual-conversion', title: 'Annual Conversion', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingAnnualConversion' },
  { id: 'rpt-meeting-annual-inflow', path: '/reports/meetings/annual-inflow', title: 'Annual Inflow', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingAnnualInflow' },

  // ─── Warehouse / Portal ───────────────────────────────────────────────────
  { id: 'wh-tickets', path: '/warehouse/tickets', title: 'Warehouse Tickets', module: 'warehouse', permission: 'warehouse.view', type: 'report', dataKey: 'warehouseTickets' },
  { id: 'wh-b2c-invoices', path: '/warehouse/b2c/invoices', title: 'Warehouse B2C Invoices', module: 'warehouse', permission: 'warehouse.dispatch', type: 'report', dataKey: 'warehouseB2cInvoices' },
  { id: 'portal-bm', path: '/portal/branch-manager', title: 'Branch Manager Portal', module: 'portal', permission: 'portal.view', type: 'dashboard', dataKey: 'portalBranchManager' },
  { id: 'portal-warehouse', path: '/portal/warehouse', title: 'Warehouse Portal', module: 'portal', permission: 'portal.view', type: 'dashboard', dataKey: 'portalWarehouse' },
  { id: 'portal-corp-wh-stock', path: '/portal/corporate/warehouse-stock', title: 'Corporate — Warehouse Stock', module: 'portal', permission: 'portal.corporate', type: 'report', dataKey: 'portalCorpWhStock' },
  { id: 'portal-consultant-photos', path: '/portal/consultant/before-after', title: 'Consultant — Before/After', module: 'portal', permission: 'portal.consultant', type: 'report', dataKey: 'portalConsultantPhotos' },
  { id: 'portal-consultant-trichoscan', path: '/portal/consultant/trichoscan', title: 'Consultant — Trichoscan', module: 'portal', permission: 'portal.consultant', type: 'report', dataKey: 'portalConsultantTrichoscan' },
  { id: 'portal-accounts-inflow', path: '/portal/accounts/inflow', title: 'Accounts — Inflow Sales', module: 'portal', permission: 'portal.accounts', type: 'dashboard', dataKey: 'portalAccountsInflow' },
  { id: 'admin-notifications', path: '/admin/notifications', title: 'Notification Log', module: 'admin', permission: 'admin.notifications', type: 'report', dataKey: 'adminNotifications' },
  { id: 'admin-ip-tracking', path: '/admin/ip-tracking', title: 'IP Tracking', module: 'admin', permission: 'admin.audit', type: 'report', dataKey: 'adminIpTracking' },

  // ─── Aesthetics ───────────────────────────────────────────────────────────
  // moved to purchaseWorkflows.js

  // ─── Factory indent / inward ──────────────────────────────────────────────
  // moved to purchaseWorkflows.js

  // asset PO/GRN moved to purchaseWorkflows.js

  // ─── Inventory gaps ───────────────────────────────────────────────────────
  { id: 'inv-outward-search', path: '/inventory/stock-outward/search', title: 'Stock Outward Search', module: 'inventory', permission: 'inventory.outward', type: 'report', dataKey: 'stockOutwardSearch' },
  { id: 'inv-wh-outward-auth', path: '/inventory/warehouse/outward/authorize', title: 'Warehouse Outward Authorization', module: 'inventory', permission: 'inventory.outward', type: 'report', dataKey: 'stockOutwardPending' },
  { id: 'inv-wh-transfer', path: '/inventory/warehouse/transfer', title: 'Stock Transfer (W to W)', module: 'inventory', permission: 'inventory.transfer', type: 'report', dataKey: 'warehouseTransfer' },
  { id: 'inv-stock-analysis', path: '/inventory/stock/analysis', title: 'Stock Analysis Report', module: 'inventory', permission: 'inventory.stock', type: 'report', dataKey: 'stockAnalysis' },
  { id: 'inv-consolidated-stock', path: '/inventory/stock/consolidated', title: 'Consolidated Stock Report', module: 'inventory', permission: 'inventory.stock', type: 'report', dataKey: 'consolidatedStock' },
  { id: 'inv-clinical-consumption-search', path: '/inventory/clinical-consumption/search', title: 'Clinical Consumption Search', module: 'inventory', permission: 'inventory.clinical', type: 'report', dataKey: 'rptClinicalConsumption' },
  { id: 'inv-asset-outward-search', path: '/inventory/assets/outward/search', title: 'Asset Outward Search', module: 'inventory', permission: 'inventory.outward', type: 'report', dataKey: 'assetOutward' },

  // ─── Appointments / procedures gaps ───────────────────────────────────────
  { id: 'appt-uhid-mapping', path: '/appointments/procedures/uhid-mapping', title: 'UHID Mapping', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'uhidMapping' },
  { id: 'appt-new-lead', path: '/appointments/procedures/new-lead', title: 'New Lead', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'newLead' },
  { id: 'appt-vssc-sales', path: '/appointments/procedures/vssc-sales', title: 'VSSC Sales Report', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'vsscSales' },
  { id: 'appt-procedure-completed-fu', path: '/appointments/procedures/completed-followup', title: 'Procedure Completed Follow-Up', module: 'appointments', permission: 'appointments.followup', type: 'report', dataKey: 'procedureCompletedFu' },
  { id: 'appt-aft-prp-booking', path: '/appointments/aft-prp-booking', title: 'AFT & PRP-Surgery Booking', module: 'appointments', permission: 'appointments.create', type: 'report', dataKey: 'aftPrpBooking' },

  // ─── Call audit / CC report gaps ──────────────────────────────────────────
  { id: 'rpt-call-audit-lead', path: '/reports/call-audit/lead-relevancy', title: 'Lead Relevancy Audit', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'callAuditLead' },
  { id: 'rpt-call-audit-genuinity', path: '/reports/call-audit/appointment-genuinity', title: 'Appointment Genuinity', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'callAuditGenuinity' },
  { id: 'rpt-cc-lead-upload', path: '/reports/call-center/lead-upload', title: 'Lead Upload', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'ccLeadUpload' },
  { id: 'rpt-cc-sms', path: '/reports/call-center/sms', title: 'SMS to Customer', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'ccSmsLog' },
  { id: 'rpt-customer-supplements', path: '/reports/customers/supplements', title: 'Customer Supplements Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptSupplements' },
  { id: 'rpt-sales-consolidated', path: '/reports/sales/consolidated', title: 'Sales Summary Consolidated', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptSalesSummary' },
  { id: 'rpt-branch-cumulative', path: '/reports/sales/branch-cumulative', title: 'Branch Cumulative Collection', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptBranchCumulative' },

  // ─── Incentive gaps ───────────────────────────────────────────────────────
  { id: 'rpt-incentive-aesthetics', path: '/reports/incentives/aesthetics-day-target', title: 'Day Target — Aesthetics', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentiveAesthetics' },
  { id: 'rpt-incentive-therapist-hair', path: '/reports/incentives/therapist-hair', title: 'Therapist Incentive (Hair)', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentiveTherapistHair' },
  { id: 'rpt-incentive-therapist-skin', path: '/reports/incentives/therapist-skin', title: 'Therapist Incentive (Skin)', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentiveTherapistSkin' },
  { id: 'rpt-incentive-overall-day', path: '/reports/incentives/overall-day', title: 'Overall Incentive — Day', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentiveOverallDay' },
  { id: 'rpt-incentive-overall-month', path: '/reports/incentives/overall-month', title: 'Overall Incentive — Month', module: 'reports', permission: 'reports.incentives', type: 'report', dataKey: 'incentiveOverallMonth' },

  // ─── Dashboard inflow / heads gaps ────────────────────────────────────────
  { id: 'dash-inflow-existing', path: '/dashboard/inflow/existing', title: 'Inflow — Existing', module: 'dashboard', permission: 'dashboard.inflow', type: 'dashboard', dataKey: 'inflowExisting' },
  { id: 'dash-inflow-new', path: '/dashboard/inflow/new', title: 'Inflow — New', module: 'dashboard', permission: 'dashboard.inflow', type: 'dashboard', dataKey: 'inflowNew' },
  { id: 'dash-heads-day-sales', path: '/dashboard/heads/day-sales', title: 'Heads Day Sales', module: 'dashboard', permission: 'dashboard.sales', type: 'report', dataKey: 'headsDaySales' },
  { id: 'dash-heads-month-sales', path: '/dashboard/heads/month-sales', title: 'Heads Month Sales', module: 'dashboard', permission: 'dashboard.sales', type: 'report', dataKey: 'headsMonthSales' },
  { id: 'dash-heads-branch', path: '/dashboard/heads/branch', title: "Head's — Branch", module: 'dashboard', permission: 'dashboard.branch', type: 'report', dataKey: 'headsBranchSales' },
  { id: 'dash-po-search', path: '/purchase/orders/search', title: 'PO Search', module: 'purchase', permission: 'purchase.po', type: 'report', dataKey: 'poSearch' },
  { id: 'sales-dc-cancel', path: '/sales/challans/cancel', title: 'DC Cancel', module: 'sales', permission: 'sales.view', type: 'report', dataKey: 'challanCancel' },
  { id: 'billing-loan-estimate', path: '/billing/loans/estimate', title: 'Loan Estimate & Approval', module: 'billing', permission: 'billing.loans', type: 'report', dataKey: 'loanEstimate' },
  { id: 'customer-joined-feedback', path: '/customer/joined-feedback', title: 'Joined Customer Feedback', module: 'customer', permission: 'customer.view', type: 'report', dataKey: 'joinedCustomerFeedback' },
  { id: 'customer-joined-fu', path: '/customer/joined-followup', title: 'Joined Follow Up', module: 'customer', permission: 'customer.view', type: 'report', dataKey: 'joinedFollowUp' },

  // ─── Meeting reports (admin / common) ─────────────────────────────────────
  { id: 'rpt-meeting-consultant-annual', path: '/reports/meetings/consultant-annual-sales', title: 'Consultant Annual Sales', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingConsultantAnnual' },
  { id: 'rpt-meeting-location-performance', path: '/reports/meetings/location-performance', title: 'FY Location Performance', module: 'reports', permission: 'reports.branches', type: 'report', dataKey: 'meetingLocationPerformance' },
  { id: 'rpt-meeting-consultant-performance', path: '/reports/meetings/consultant-performance', title: 'FY Consultant Performance', module: 'reports', permission: 'reports.consultants', type: 'report', dataKey: 'meetingConsultantPerformance' },
  { id: 'rpt-meeting-daily-inflow', path: '/reports/meetings/daily-inflow', title: 'Daily Inflow Report', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingDailyInflow' },
  { id: 'rpt-meeting-annual-sales', path: '/reports/meetings/annual-sales', title: 'Annual Sales Report', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingAnnualSales' },
  { id: 'rpt-meeting-hma-annual', path: '/reports/meetings/hma-annual', title: 'HMA Annual Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingHmaAnnual' },
  { id: 'rpt-meeting-location-target-month', path: '/reports/meetings/location-target-month', title: 'Location Target — Month', module: 'reports', permission: 'reports.targets', type: 'report', dataKey: 'meetingLocationTargetMonth' },
  { id: 'rpt-meeting-treatment-execution', path: '/reports/meetings/treatment-execution', title: 'Treatment Execution Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingTreatmentExecution' },
  { id: 'rpt-meeting-treatment-status-hs', path: '/reports/meetings/treatment-status-hair-skin', title: 'Treatment Status — Hair & Skin', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingTreatmentStatusHs' },
  { id: 'rpt-meeting-customer-visits', path: '/reports/meetings/customer-visits', title: 'Customer Visits (Meeting)', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'rptCustomerVisits' },
  { id: 'rpt-meeting-annual-lead', path: '/reports/meetings/annual-lead', title: 'Annual Lead Report', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingAnnualLead' },
  { id: 'rpt-meeting-lead-management', path: '/reports/meetings/lead-management', title: 'Lead Management', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingLeadManagement' },
  { id: 'rpt-meeting-lead-vs-appt', path: '/reports/meetings/lead-vs-appointment', title: 'Lead vs Appointment — Day Wise', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingLeadVsAppt' },
  { id: 'rpt-meeting-billed-vs-advance', path: '/reports/meetings/billed-vs-advance', title: 'Billed vs Advance Receipt', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'meetingBilledVsAdvance' },
  { id: 'rpt-meeting-pending-session', path: '/reports/meetings/pending-session', title: 'Annual Pending Session', module: 'reports', permission: 'reports.customers', type: 'report', dataKey: 'meetingPendingSession' },
  { id: 'rpt-meeting-day-wise-sales', path: '/reports/meetings/day-wise-sales', title: 'Day Wise Sales (Meeting)', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'headsDaySales' },
  { id: 'rpt-meeting-consultant-achievement', path: '/reports/meetings/consultant-achievement', title: 'Consultant Achievement (Hair & Skin)', module: 'reports', permission: 'reports.consultants', type: 'report', dataKey: 'meetingConsultantAchievement' },
  { id: 'rpt-meeting-heads-sales', path: '/reports/meetings/heads-sales', title: 'Heads Sales Report', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'headsBranchSales' },
  { id: 'rpt-meeting-branch-hair-skin', path: '/reports/meetings/branch-hair-skin', title: 'Branch Hair & Skin', module: 'reports', permission: 'reports.branches', type: 'report', dataKey: 'rptBranchCumulative' },
  { id: 'rpt-meeting-consultant-target', path: '/reports/meetings/consultant-target', title: 'Consultant Target Report', module: 'reports', permission: 'reports.targets', type: 'report', dataKey: 'consultantTargets' },
  { id: 'rpt-meeting-sales-consolidated', path: '/reports/meetings/sales-consolidated', title: 'Sales (Service & Product) Consolidated', module: 'reports', permission: 'reports.sales', type: 'report', dataKey: 'rptSalesSummary' },

  // ─── GST SAC ──────────────────────────────────────────────────────────────
  { id: 'rpt-gst-sac-summary', path: '/reports/gst/sac/summary', title: 'GST SAC — Sales Summary', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstSacSummary' },
  { id: 'rpt-gst-sac-daywise', path: '/reports/gst/sac/daywise', title: 'GST SAC — Day Wise', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstSacDaywise' },
  { id: 'rpt-gst-sac-b2b', path: '/reports/gst/sac/b2b', title: 'GST SAC — B2B Sales', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstSacB2b' },
  { id: 'rpt-gst-sac-b2c', path: '/reports/gst/sac/b2c', title: 'GST SAC — B2C Sales', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstSacB2c' },
  { id: 'rpt-gst-sac-purchase', path: '/reports/gst/sac/purchase', title: 'GST SAC — Purchase', module: 'reports', permission: 'reports.gst', type: 'report', dataKey: 'gstSacPurchase' },

  // ─── Dashboard remaining ──────────────────────────────────────────────────
  { id: 'dash-highest-sales-day', path: '/dashboard/highest-sales/day', title: 'Highest Sales — Day', module: 'dashboard', permission: 'dashboard.sales', type: 'dashboard', dataKey: 'highestSalesDay' },
  { id: 'dash-highest-sales-month', path: '/dashboard/highest-sales/month', title: 'Highest Sales — Month', module: 'dashboard', permission: 'dashboard.sales', type: 'dashboard', dataKey: 'highestSalesMonth' },
  { id: 'dash-highest-sales-state', path: '/dashboard/highest-sales/state', title: 'Highest Sales — State', module: 'dashboard', permission: 'dashboard.sales', type: 'report', dataKey: 'highestSalesState' },
  { id: 'dash-branch-highest', path: '/dashboard/branch/highest', title: 'Branch Highest Day & Month', module: 'dashboard', permission: 'dashboard.branch', type: 'dashboard', dataKey: 'branchHighestDayMonth' },
  { id: 'dash-branch-consultant', path: '/dashboard/branch/consultants', title: 'Branch & Consultant', module: 'dashboard', permission: 'dashboard.branch', type: 'report', dataKey: 'dashBranchConsultant' },
  { id: 'dash-branch-target-month', path: '/dashboard/branch/target-month', title: 'Branch Target — Month', module: 'dashboard', permission: 'dashboard.branch', type: 'report', dataKey: 'meetingLocationTargetMonth' },
  { id: 'dash-investment-report', path: '/operations/investment/report', title: 'Investment Report', module: 'operations', permission: 'operations.iou', type: 'report', dataKey: 'investmentReport' },
  { id: 'ops-new-joinee-view', path: '/operations/new-joinee/view', title: 'New Joinee View', module: 'operations', permission: 'operations.tickets', type: 'report', dataKey: 'newJoineeView' },
  { id: 'ops-staff-count', path: '/operations/manpower/staff-count', title: 'Staff Count', module: 'operations', permission: 'operations.tickets', type: 'report', dataKey: 'staffCount' },
  { id: 'dash-treatment-appts', path: '/dashboard/treatment/appointments', title: 'Treatment Appointments', module: 'dashboard', permission: 'dashboard.treatment', type: 'report', dataKey: 'ccTreatmentAppts' },
  { id: 'dash-treatment-calendar', path: '/dashboard/treatment/calendar', title: 'Treatment Calendar', module: 'dashboard', permission: 'dashboard.treatment', type: 'report', dataKey: 'performerCalendar' },

  // ─── Procedure / appointment forms ────────────────────────────────────────
  { id: 'appt-procedure-form', path: '/appointments/procedures/form', title: 'Procedure Form', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'procedureFormList' },
  { id: 'appt-procedure-consent', path: '/appointments/procedures/consent', title: 'Procedure Consent Form', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'procedureConsentList' },
  { id: 'appt-procedure-photos', path: '/appointments/procedures/photos', title: 'Procedure Photos & Forms', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'procedurePhotosList' },
  { id: 'appt-pre-procedure-photo', path: '/appointments/procedures/pre-photo', title: 'Pre Procedure Photo', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'preProcedurePhotos' },
  { id: 'appt-post-procedure-photo', path: '/appointments/procedures/post-photo', title: 'Post Procedure Photo', module: 'appointments', permission: 'appointments.procedures', type: 'report', dataKey: 'postProcedurePhotos' },

  // ─── Purchase / inventory small gaps ──────────────────────────────────────
  { id: 'purchase-vendor-clinical-items', path: '/purchase/vendors/clinical-items', title: 'Clinical — Vendor Item', module: 'purchase', permission: 'purchase.vendors', type: 'report', dataKey: 'vendorClinicalItems' },
  { id: 'purchase-vendor-billable-items', path: '/purchase/vendors/billable-items', title: 'Billable — Vendor Item', module: 'purchase', permission: 'purchase.vendors', type: 'report', dataKey: 'vendorBillableItems' },
  { id: 'purchase-sales-customer', path: '/purchase/sales-customers', title: 'Sales Customer Master', module: 'purchase', permission: 'purchase.vendors', type: 'report', dataKey: 'salesCustomerMaster' },
  { id: 'purchase-clinical-batch', path: '/purchase/batches/clinical', title: 'Clinical Batch Master', module: 'purchase', permission: 'purchase.vendors', type: 'master', model: 'productBatch', fields: ['productId', 'batchNo', 'stockType', 'expiryDate'] },
  { id: 'inv-product-tax', path: '/inventory/masters/product-tax', title: 'Center Product Tax Master', module: 'inventory', permission: 'inventory.products', type: 'report', dataKey: 'productTaxMaster' },
  { id: 'inv-advance-kit', path: '/inventory/masters/advance-kit', title: 'Advance Kit Master', module: 'inventory', permission: 'inventory.products', type: 'report', dataKey: 'advanceKitMaster' },
  { id: 'inv-product-mapping', path: '/inventory/masters/product-mapping', title: 'Product Mapping Master', module: 'inventory', permission: 'inventory.products', type: 'report', dataKey: 'productMappingMaster' },
  { id: 'inv-asset-subcategory', path: '/inventory/masters/asset-subcategory', title: 'Asset Sub Category', module: 'inventory', permission: 'inventory.products', type: 'master', model: 'assetCategory', fields: ['code', 'name'] },
  { id: 'inv-service-master', path: '/inventory/masters/services', title: 'Service Master (Clinical)', module: 'inventory', permission: 'inventory.clinical', type: 'report', dataKey: 'clinicalServiceMaster' },
  { id: 'inv-asset-barcode', path: '/inventory/assets/barcode', title: 'Generate Branch Asset Barcode', module: 'inventory', permission: 'inventory.stock', type: 'report', dataKey: 'assetBarcodeList' },

  // ─── Actionable operations (approve / settle) ───────────────────────────────
  { id: 'ops-reimbursement-approve', path: '/operations/iou/reimbursement/approve', title: 'Reimbursement Approval', module: 'operations', permission: 'operations.iou', type: 'report', dataKey: 'reimbursementApproval', actions: 'reimburse-approve' },
];

/** Paths served by dedicated workflow routers — excluded from generic registry */
const DEDICATED_WORKFLOW_PATHS = new Set([
  '/call-center/dialer',
  '/purchase/aesthetics/orders', '/purchase/aesthetics/orders/search', '/purchase/aesthetics/grn',
  '/purchase/aesthetics/grn/search', '/purchase/aesthetics/invoices', '/purchase/aesthetics/orders/authorize',
  '/purchase/factory/indents', '/purchase/factory/indents/search', '/purchase/factory/inward',
  '/purchase/factory/inward/search', '/purchase/factory/inward/quality', '/purchase/factory/inward/report',
  '/purchase/asset-po/search', '/purchase/asset-po/authorize', '/purchase/asset-grn',
  '/portal/branch-manager', '/portal/warehouse',
]);

export const registryScreens = _registryScreensRaw.filter((s) => !DEDICATED_WORKFLOW_PATHS.has(s.path.split('?')[0]));

import { resolveNavGroup, sortGroupNames, flattenNavChildren, findNavItem } from './navGroups.js';

const pathSet = new Set(registryScreens.map((s) => s.path));

export function getScreenByPath(path) {
  const clean = path.split('?')[0];
  return registryScreens.find((s) => s.path === clean);
}

export function getRegistryNavigationItems() {
  const groups = {};
  for (const s of registryScreens) {
    if (!groups[s.module]) groups[s.module] = [];
    groups[s.module].push({ label: s.title, path: s.path, permission: s.permission });
  }
  return groups;
}

export function mergeRegistryIntoNavigation(navigation, permissions = []) {
  const has = (p) => !p || permissions.includes(p) || permissions.includes('*');
  const moduleToNavId = {
    master: 'master', customer: 'customer', appointments: 'appointments', callcenter: 'callcenter',
    billing: 'billing', sales: 'sales', inventory: 'inventory', purchase: 'purchase',
    warehouse: 'warehouse', operations: 'operations', reports: 'reports', dashboard: 'dashboard',
    portal: 'portal', admin: 'admin',
  };

  const existingPaths = new Set();
  for (const section of navigation) {
    for (const p of flattenNavChildren(section.children)) existingPaths.add(p);
  }

  const byModule = {};
  for (const s of registryScreens) {
    if (!has(s.permission)) continue;
    const clean = s.path.split('?')[0];
    if (existingPaths.has(clean)) continue;
    const group = resolveNavGroup(s);
    if (!byModule[s.module]) byModule[s.module] = {};
    if (!byModule[s.module][group]) byModule[s.module][group] = [];
    byModule[s.module][group].push({ label: s.title, path: s.path, permission: s.permission });
  }

  return navigation.map((section) => {
    const mod = Object.entries(moduleToNavId).find(([, id]) => id === section.id)?.[0];
    if (!mod || !byModule[mod]) return section;

    const grouped = [];
    for (const groupName of sortGroupNames(Object.keys(byModule[mod]))) {
      const items = byModule[mod][groupName];
      if (!items.length) continue;
      grouped.push({ isGroup: true, label: groupName, children: items });
    }
    if (!grouped.length) return section;
    return { ...section, children: [...section.children, ...grouped] };
  });
}
