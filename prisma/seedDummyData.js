/**
 * Idempotent dummy data for registry screens and operational modules.
 * Safe to run multiple times (uses upsert / skipDuplicates).
 */
export async function seedDummyData(prisma, ctx) {
  const {
    branchHair, branchSkin, branchWarehouse, allProducts, vendor,
    customers, createdUsers, consultantHair, consultantSkin, month, year,
    prpTreatment, htTreatment, gfcTreatment,
  } = ctx;

  const adminId = createdUsers['admin@vcare.com'].id;
  const bmId = createdUsers['bm.hair@vcare.com'].id;
  const ccId = createdUsers['cc.agent@vcare.com'].id;
  const accountsId = createdUsers['accounts@vcare.com'].id;

  console.log('  📦 Seeding extended dummy data...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const branch of [branchHair, branchSkin]) {
    await prisma.locationTargetDay.upsert({
      where: { id: `ltd-${branch.code}` },
      create: {
        id: `ltd-${branch.code}`,
        branchId: branch.id,
        targetDate: today,
        target: 75000,
        achieved: 45000,
      },
      update: { achieved: 45000 + Math.floor(Math.random() * 10000) },
    });
  }

  await prisma.consultantTargetDay.upsert({
    where: { id: 'ctd-hair-001' },
    create: { id: 'ctd-hair-001', consultantId: consultantHair.id, targetDate: today, target: 35000, achieved: 28000 },
    update: { achieved: 28000 },
  });
  await prisma.consultantTargetDay.upsert({
    where: { id: 'ctd-skin-001' },
    create: { id: 'ctd-skin-001', consultantId: consultantSkin.id, targetDate: today, target: 30000, achieved: 22000 },
    update: { achieved: 22000 },
  });

  await prisma.headsTarget.upsert({
    where: { id: 'heads-target-001' },
    create: { id: 'heads-target-001', userId: adminId, month, year, target: 500000, achieved: 380000 },
    update: { achieved: 380000 },
  });

  await prisma.cCLocationTarget.upsert({
    where: { id: 'cclt-hair' },
    create: { id: 'cclt-hair', branchId: branchHair.id, month, year, target: 200, achieved: 145 },
    update: {},
  });
  await prisma.cCAgentTarget.upsert({
    where: { id: 'ccat-001' },
    create: { id: 'ccat-001', agentId: ccId, month, year, target: 150, achieved: 112 },
    update: {},
  });

  const ruleCount = await prisma.therapistIncentiveRule.count();
  if (ruleCount === 0) {
    await prisma.therapistIncentiveRule.createMany({
      data: [
        { category: 'HAIR', ratePercent: 2.5, flatAmount: 500 },
        { category: 'SKIN', ratePercent: 2.0, flatAmount: 400 },
      ],
    });
  }

  const billableProduct = allProducts.find((p) => p.type === 'BILLABLE');
  const clinicalProduct = allProducts.find((p) => p.type === 'CLINICAL');
  const mesoProduct = allProducts.find((p) => p.sku === 'MESO-N') || clinicalProduct;

  const procedureConsumptionRows = [
    clinicalProduct && prpTreatment ? { id: 'pc-demo-prp', procedureType: 'PRP', productId: clinicalProduct.id, quantity: 2 } : null,
    mesoProduct && gfcTreatment ? { id: 'pc-demo-gfc', procedureType: 'GFC', productId: mesoProduct.id, quantity: 1 } : null,
    clinicalProduct && htTreatment ? { id: 'pc-demo-ht', procedureType: 'HT-FUE', productId: clinicalProduct.id, quantity: 3 } : null,
  ].filter(Boolean);

  for (const row of procedureConsumptionRows) {
    await prisma.procedureConsumption.upsert({
      where: { id: row.id },
      create: row,
      update: { productId: row.productId, quantity: row.quantity, isActive: true },
    });
  }

  if (billableProduct) {
    await prisma.kitMapping.upsert({
      where: { kitCode: 'KIT-HT-01' },
      create: {
        kitCode: 'KIT-HT-01',
        name: 'Hair Transplant Kit',
        mapType: 'M2O',
        itemsJson: JSON.stringify([{ productId: billableProduct.id, qty: 2 }]),
      },
      update: {},
    });
    await prisma.productBatch.upsert({
      where: { productId_batchNo: { productId: billableProduct.id, batchNo: 'BN2026A' } },
      create: {
        productId: billableProduct.id,
        batchNo: 'BN2026A',
        stockType: 'BILLABLE',
        expiryDate: new Date('2027-12-31'),
      },
      update: {},
    });
  }

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const visitNo = `VIS2026${String(i + 1).padStart(5, '0')}`;
    const visit = await prisma.customerVisit.upsert({
      where: { visitNo },
      create: {
        visitNo,
        customerId: c.id,
        branchId: c.branchId,
        consultantId: c.category === 'HAIR' ? consultantHair.id : consultantSkin.id,
        visitType: i % 2 === 0 ? 'TREATMENT' : 'CONSULTATION',
        sessionNo: i + 1,
        visitedAt: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000),
        createdById: bmId,
      },
      update: {},
    });

    await prisma.treatmentFeedback.upsert({
      where: { visitId: visit.id },
      create: {
        visitId: visit.id,
        customerId: c.id,
        rating: 3 + (i % 3),
        feedback: ['Good progress', 'Satisfied with results', 'Needs follow-up'][i % 3],
        createdById: consultantHair.id,
      },
      update: {},
    });

    const testType = i % 2 === 0 ? 'HMA' : 'DSA';
    await prisma.customerTest.upsert({
      where: { testNo: `TST${testType}2026${String(i + 1).padStart(4, '0')}` },
      create: {
        testNo: `TST${testType}2026${String(i + 1).padStart(4, '0')}`,
        customerId: c.id,
        type: testType,
        status: ['PENDING', 'COMPLETED', 'COMPLETED'][i % 3],
        findings: testType === 'HMA' ? 'Stage II AGA' : 'Moderate density loss',
        performedById: consultantHair.id,
      },
      update: {},
    });
  }

  const treatmentByIndex = [prpTreatment, prpTreatment, gfcTreatment, prpTreatment, htTreatment, prpTreatment];
  for (let i = 0; i < 6; i++) {
    const c = customers[i];
    const status = ['IN_PROGRESS', 'BOOKED', 'COMPLETED', 'BOOKED', 'COMPLETED', 'BOOKED'][i];
    const isUnbilled = i === 2;
    const treatment = treatmentByIndex[i];
    const needsConsent = i === 0;
    await prisma.procedure.upsert({
      where: { procedureNo: `PROC2026${String(i + 1).padStart(5, '0')}` },
      create: {
        procedureNo: `PROC2026${String(i + 1).padStart(5, '0')}`,
        customerId: c.id,
        treatmentId: treatment?.id || null,
        performerId: c.category === 'HAIR' ? consultantHair.id : consultantSkin.id,
        scheduledAt: new Date(Date.now() + i * 2 * 24 * 60 * 60 * 1000),
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        billId: isUnbilled ? null : undefined,
        consentGiven: !needsConsent && i % 2 === 0,
      },
      update: {
        treatmentId: treatment?.id || null,
        ...(isUnbilled ? { status: 'COMPLETED', billId: null, completedAt: new Date() } : {}),
        ...(needsConsent ? { status: 'IN_PROGRESS', consentGiven: false } : {}),
      },
    });
  }

  // ─── Multi-session treatment plans (Arun + Karthik history) ─────────────────
  const arun = customers[0];
  const karthik = customers[2];
  const prpLabel = prpTreatment?.name || 'PRP';
  const gfcLabel = gfcTreatment?.name || 'GFC';

  const arunSlip = await prisma.treatmentSlip.upsert({
    where: { slipNo: 'TSL202600001' },
    create: {
      slipNo: 'TSL202600001',
      customerId: arun.id,
      treatments: JSON.stringify([{ code: 'PRP', name: prpLabel }]),
      sessions: 6,
      sessionCadence: 'WEEKLY',
      status: 'ACTIVE',
      notes: '6-session PRP course — demo plan',
      createdById: consultantHair.id,
    },
    update: { status: 'ACTIVE', sessions: 6, treatments: JSON.stringify([{ code: 'PRP', name: prpLabel }]) },
  });

  await prisma.procedure.update({
    where: { procedureNo: 'PROC202600001' },
    data: { treatmentSlipId: arunSlip.id, sessionNo: 1 },
  });

  const karthikSlip = await prisma.treatmentSlip.upsert({
    where: { slipNo: 'TSL202600002' },
    create: {
      slipNo: 'TSL202600002',
      customerId: karthik.id,
      treatments: JSON.stringify([{ code: 'GFC', name: gfcLabel }]),
      sessions: 4,
      sessionCadence: 'MONTHLY',
      status: 'ACTIVE',
      notes: '4-session GFC — sessions 1–2 completed',
      createdById: consultantHair.id,
    },
    update: { status: 'ACTIVE' },
  });

  const karthikVisit1 = await prisma.customerVisit.upsert({
    where: { visitNo: 'VIS-PLAN20260001' },
    create: {
      visitNo: 'VIS-PLAN20260001',
      customerId: karthik.id,
      branchId: karthik.branchId,
      consultantId: consultantHair.id,
      visitType: 'TREATMENT',
      sessionNo: 1,
      treatmentNotes: `Session 1: ${gfcLabel}`,
      visitedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      createdById: bmId,
    },
    update: { sessionNo: 1 },
  });

  const karthikVisit2 = await prisma.customerVisit.upsert({
    where: { visitNo: 'VIS-PLAN20260002' },
    create: {
      visitNo: 'VIS-PLAN20260002',
      customerId: karthik.id,
      branchId: karthik.branchId,
      consultantId: consultantHair.id,
      visitType: 'TREATMENT',
      sessionNo: 2,
      treatmentNotes: `Session 2: ${gfcLabel}`,
      visitedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      createdById: bmId,
    },
    update: { sessionNo: 2 },
  });

  await prisma.procedure.update({
    where: { procedureNo: 'PROC202600003' },
    data: {
      treatmentSlipId: karthikSlip.id,
      sessionNo: 1,
      customerVisitId: karthikVisit1.id,
      completedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      consentGiven: true,
    },
  });

  await prisma.procedure.upsert({
    where: { procedureNo: 'PROC2026HIST002' },
    create: {
      procedureNo: 'PROC2026HIST002',
      customerId: karthik.id,
      treatmentId: gfcTreatment?.id || null,
      performerId: consultantHair.id,
      branchId: karthik.branchId,
      treatmentSlipId: karthikSlip.id,
      sessionNo: 2,
      customerVisitId: karthikVisit2.id,
      scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
      consentGiven: true,
    },
    update: {
      treatmentSlipId: karthikSlip.id,
      sessionNo: 2,
      customerVisitId: karthikVisit2.id,
      status: 'COMPLETED',
      consentGiven: true,
    },
  });

  await prisma.followUp.upsert({
    where: { id: 'fu-pending-advance' },
    create: {
      id: 'fu-pending-advance',
      customerId: customers[0].id,
      type: 'PENDING_ADVANCE',
      status: 'PENDING',
      scheduledAt: new Date(),
      assignedTo: ccId,
      feedback: 'Advance payment pending',
    },
    update: {},
  });
  await prisma.followUp.upsert({
    where: { id: 'fu-treatment' },
    create: {
      id: 'fu-treatment',
      customerId: customers[1].id,
      type: 'TREATMENT',
      status: 'PENDING',
      scheduledAt: new Date(),
      assignedTo: ccId,
    },
    update: {},
  });
  await prisma.followUp.upsert({
    where: { id: 'fu-joined' },
    create: {
      id: 'fu-joined',
      customerId: customers[3].id,
      type: 'JOINED',
      status: 'PENDING',
      scheduledAt: new Date(),
      assignedTo: ccId,
    },
    update: {},
  });

  await prisma.dTRRecord.upsert({
    where: { dtrNo: 'DTR20260001' },
    create: {
      dtrNo: 'DTR20260001',
      branchId: branchHair.id,
      openingCash: 5000,
      closingCash: 4850,
      notes: 'Day close — normal',
      createdById: bmId,
    },
    update: {},
  });

  await prisma.manpowerRequisition.upsert({
    where: { reqNo: 'MPR20260001' },
    create: {
      reqNo: 'MPR20260001',
      branchId: branchHair.id,
      designation: 'Therapist',
      headcount: 2,
      reason: 'Increased treatment volume',
      status: 'PENDING',
      createdById: bmId,
    },
    update: {},
  });

  await prisma.investment.upsert({
    where: { invNo: 'INV20260001' },
    create: {
      invNo: 'INV20260001',
      branchId: branchHair.id,
      category: 'EQUIPMENT',
      amount: 250000,
      description: 'New laser device',
      createdById: adminId,
    },
    update: {},
  });

  await prisma.newJoinee.upsert({
    where: { employeeId: 'E8001' },
    create: {
      employeeId: 'E8001',
      firstName: 'Riya',
      lastName: 'Kapoor',
      designation: 'Therapist',
      branchId: branchSkin.id,
      joiningDate: new Date(),
      status: 'ACTIVE',
    },
    update: {},
  });

  await prisma.documentStore.upsert({
    where: { id: 'doc-policy-001' },
    create: {
      id: 'doc-policy-001',
      title: 'Branch SOP Manual',
      category: 'POLICY',
      uploadedById: adminId,
      branchId: branchHair.id,
    },
    update: {},
  });

  await prisma.iOURequest.upsert({
    where: { requestNo: 'IOU20260001' },
    create: {
      requestNo: 'IOU20260001',
      requesterId: bmId,
      branchId: branchHair.id,
      amount: 15000,
      purpose: 'Branch event supplies',
      status: 'APPROVED',
      approvedById: adminId,
      approvedAt: new Date(),
    },
    update: {},
  });

  await prisma.iOURequest.upsert({
    where: { requestNo: 'IOU20260002' },
    create: {
      requestNo: 'IOU20260002',
      requesterId: consultantHair.id,
      branchId: branchHair.id,
      amount: 5000,
      purpose: 'Conference travel advance',
      status: 'PENDING',
    },
    update: {},
  });

  await prisma.pettyCash.upsert({
    where: { entryNo: 'PC20260001' },
    create: {
      entryNo: 'PC20260001',
      branchId: branchHair.id,
      amount: 2500,
      category: 'STATIONERY',
      description: 'Office supplies',
      status: 'PENDING',
    },
    update: {},
  });

  await prisma.reimbursementClaim.upsert({
    where: { claimNo: 'CLM20260001' },
    create: {
      claimNo: 'CLM20260001',
      requesterId: consultantHair.id,
      amount: 3500,
      purpose: 'Client visit travel',
      status: 'PENDING',
    },
    update: {},
  });

  await prisma.refundComplaint.upsert({
    where: { complaintNo: 'RC20260001' },
    create: {
      complaintNo: 'RC20260001',
      customerId: customers[0].id,
      complaint: 'Delayed refund processing',
      status: 'OPEN',
      createdById: bmId,
    },
    update: {},
  });

  await prisma.callAudit.upsert({
    where: { auditNo: 'CAU20260001' },
    create: {
      auditNo: 'CAU20260001',
      callType: 'LEAD_RELEVANCY',
      score: 85,
      findings: 'Lead qualified correctly',
      auditedById: adminId,
      customerId: customers[1].id,
    },
    update: {},
  });

  const assetCat = await prisma.assetCategory.upsert({
    where: { code: 'IT' },
    create: { code: 'IT', name: 'IT Equipment' },
    update: {},
  });

  await prisma.asset.upsert({
    where: { assetNo: 'AST20260001' },
    create: {
      assetNo: 'AST20260001',
      categoryId: assetCat.id,
      name: 'Biometric Device',
      branchId: branchHair.id,
      value: 18000,
      barcode: 'VC-AST-001',
      status: 'ACTIVE',
    },
    update: {},
  });

  let po = await prisma.purchaseOrder.findFirst();
  if (!po && billableProduct) {
    po = await prisma.purchaseOrder.upsert({
      where: { poNo: 'PO20260001' },
      create: {
        poNo: 'PO20260001',
        vendorId: vendor.id,
        status: 'APPROVED',
        totalAmount: 25000,
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 100,
            unitPrice: 250,
            totalAmount: 25000,
          }],
        },
      },
      update: {},
    });
  }

  if (po) {
    await prisma.gRN.upsert({
      where: { grnNo: 'GRN20260001' },
      create: { grnNo: 'GRN20260001', poId: po.id, status: 'ACCEPTED', receivedDate: new Date() },
      update: {},
    });
  }

  // ─── Purchase workflow chains (aesthetics / factory / asset) ───────────────
  if (billableProduct && clinicalProduct) {
    const aestheticsPending = await prisma.purchaseOrder.upsert({
      where: { poNo: 'APO2026DEMO01' },
      create: {
        poNo: 'APO2026DEMO01',
        vendorId: vendor.id,
        branchId: branchSkin.id,
        orderType: 'AESTHETICS',
        status: 'PENDING_AUTH',
        totalAmount: 15000,
        notes: 'Aesthetics center replenishment',
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 30,
            unitPrice: 500,
            totalAmount: 15000,
          }],
        },
      },
      update: {},
    });

    const aestheticsApproved = await prisma.purchaseOrder.upsert({
      where: { poNo: 'APO2026DEMO02' },
      create: {
        poNo: 'APO2026DEMO02',
        vendorId: vendor.id,
        branchId: branchHair.id,
        orderType: 'AESTHETICS',
        status: 'APPROVED',
        totalAmount: 9000,
        items: {
          create: [{
            productId: clinicalProduct.id,
            quantity: 20,
            unitPrice: 450,
            totalAmount: 9000,
          }],
        },
      },
      update: {},
    });

    await prisma.gRN.upsert({
      where: { grnNo: 'AGR2026DEMO01' },
      create: {
        grnNo: 'AGR2026DEMO01',
        poId: aestheticsApproved.id,
        branchId: branchHair.id,
        grnType: 'AESTHETICS',
        status: 'QUALITY_CHECK',
        items: {
          create: [{
            productId: clinicalProduct.id,
            quantity: 20,
            batchNo: 'AES-B001',
            branchId: branchHair.id,
            qualityStatus: 'PENDING',
          }],
        },
      },
      update: {},
    });

    const aestheticsAcceptedPo = await prisma.purchaseOrder.upsert({
      where: { poNo: 'APO2026DEMO03' },
      create: {
        poNo: 'APO2026DEMO03',
        vendorId: vendor.id,
        branchId: branchSkin.id,
        orderType: 'AESTHETICS',
        status: 'APPROVED',
        totalAmount: 6000,
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 10,
            unitPrice: 600,
            totalAmount: 6000,
            received: 10,
          }],
        },
      },
      update: {},
    });

    await prisma.gRN.upsert({
      where: { grnNo: 'AGR2026DEMO02' },
      create: {
        grnNo: 'AGR2026DEMO02',
        poId: aestheticsAcceptedPo.id,
        branchId: branchSkin.id,
        grnType: 'AESTHETICS',
        status: 'ACCEPTED',
        receivedDate: new Date(),
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 10,
            batchNo: 'AES-B002',
            branchId: branchSkin.id,
            qualityStatus: 'PASSED',
          }],
        },
      },
      update: {},
    });
  }

  const factoryIndent = await prisma.factoryIndent.upsert({
    where: { indentNo: 'FIN20260001' },
    create: {
      indentNo: 'FIN20260001',
      branchId: branchWarehouse?.id || branchHair.id,
      notes: 'Factory raw material indent',
      status: 'APPROVED',
      createdById: bmId,
      approvedById: adminId,
      approvedAt: new Date(),
      ...(billableProduct ? {
        items: {
          create: [{ productId: billableProduct.id, quantity: 200, fulfilled: 0 }],
        },
      } : {}),
    },
    update: { status: 'APPROVED' },
  });

  await prisma.factoryIndent.upsert({
    where: { indentNo: 'FIN2026DEMO02' },
    create: {
      indentNo: 'FIN2026DEMO02',
      branchId: branchHair.id,
      notes: 'Pending factory indent for approval demo',
      status: 'PENDING',
      createdById: bmId,
      ...(clinicalProduct ? {
        items: { create: [{ productId: clinicalProduct.id, quantity: 50 }] },
      } : {}),
    },
    update: {},
  });

  if (billableProduct && factoryIndent) {
    const factoryPo = await prisma.purchaseOrder.upsert({
      where: { poNo: 'FPO2026DEMO01' },
      create: {
        poNo: 'FPO2026DEMO01',
        vendorId: vendor.id,
        branchId: branchWarehouse?.id || branchHair.id,
        factoryIndentId: factoryIndent.id,
        orderType: 'FACTORY',
        status: 'APPROVED',
        totalAmount: 50000,
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 100,
            unitPrice: 500,
            totalAmount: 50000,
          }],
        },
      },
      update: {},
    });

    await prisma.gRN.upsert({
      where: { grnNo: 'FGR2026DEMO01' },
      create: {
        grnNo: 'FGR2026DEMO01',
        poId: factoryPo.id,
        branchId: branchWarehouse?.id || branchHair.id,
        factoryIndentId: factoryIndent.id,
        grnType: 'FACTORY',
        status: 'QUALITY_CHECK',
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 100,
            batchNo: 'FAC-B001',
            branchId: branchWarehouse?.id || branchHair.id,
            qualityStatus: 'PENDING',
          }],
        },
      },
      update: {},
    });
  }

  await prisma.assetPurchaseOrder.upsert({
    where: { apoNo: 'ASPO2026DEMO01' },
    create: {
      apoNo: 'ASPO2026DEMO01',
      vendorId: vendor.id,
      branchId: branchHair.id,
      totalAmount: 85000,
      status: 'PENDING_AUTH',
      createdById: adminId,
      items: {
        create: [
          { description: 'Laser machine spare kit', quantity: 1, unitCost: 45000, totalAmount: 45000 },
          { description: 'Treatment chair', quantity: 2, unitCost: 20000, totalAmount: 40000 },
        ],
      },
    },
    update: {},
  });

  await prisma.assetPurchaseOrder.upsert({
    where: { apoNo: 'ASPO2026DEMO02' },
    create: {
      apoNo: 'ASPO2026DEMO02',
      vendorId: vendor.id,
      branchId: branchSkin.id,
      totalAmount: 120000,
      status: 'APPROVED',
      createdById: adminId,
      items: {
        create: [{ description: 'Skin analyzer device', quantity: 1, unitCost: 120000, totalAmount: 120000 }],
      },
    },
    update: {},
  });

  await prisma.assetPurchaseOrder.upsert({
    where: { apoNo: 'APO20260001' },
    create: {
      apoNo: 'APO20260001',
      vendorId: vendor.id,
      totalAmount: 120000,
      status: 'PENDING_AUTH',
      createdById: adminId,
    },
    update: {},
  });

  await prisma.workOrder.upsert({
    where: { woNo: 'WO20260001' },
    create: {
      woNo: 'WO20260001',
      branchId: branchHair.id,
      description: 'Laser calibration',
      status: 'PENDING_AUTH',
      createdById: bmId,
    },
    update: {},
  });

  const corpCustomer = await prisma.customer.upsert({
    where: { uhid: 'UHID2026CORP01' },
    create: {
      uhid: 'UHID2026CORP01',
      firstName: 'Acme',
      lastName: 'Corp',
      phone: '9876510000',
      customerType: 'CORPORATE',
      companyName: 'Acme Wellness Pvt Ltd',
      gstin: '33AABCA1234A1Z5',
      branchId: branchHair.id,
      category: 'HAIR',
    },
    update: {},
  });

  const salesOrder = await prisma.salesOrder.upsert({
    where: { orderNo: 'SO20260001' },
    create: {
      orderNo: 'SO20260001',
      customerId: corpCustomer.id,
      branchId: branchHair.id,
      status: 'CONFIRMED',
      totalAmount: billableProduct ? 45000 : 0,
      createdById: bmId,
      ...(billableProduct ? {
        items: {
          create: [{
            productId: billableProduct.id,
            quantity: 50,
            unitPrice: 900,
            totalAmount: 45000,
          }],
        },
      } : {}),
    },
    update: {},
  });

  await prisma.deliveryChallan.upsert({
    where: { challanNo: 'DC20260001' },
    create: {
      challanNo: 'DC20260001',
      orderId: salesOrder.id,
      status: 'ISSUED',
      deliveredAt: new Date(),
      createdById: bmId,
    },
    update: {},
  });

  await prisma.stockOutward.upsert({
    where: { outwardNo: 'OUT20260001' },
    create: {
      outwardNo: 'OUT20260001',
      branchId: branchHair.id,
      status: 'PENDING',
      createdById: bmId,
    },
    update: {},
  });

  if (billableProduct) {
    await prisma.physicalStockAudit.upsert({
      where: { auditNo: 'PSA20260001' },
      create: {
        auditNo: 'PSA20260001',
        branchId: branchHair.id,
        productId: billableProduct.id,
        systemQty: 80,
        physicalQty: 78,
        variance: -2,
        auditedById: bmId,
      },
      update: {},
    });
  }

  await prisma.permanentRefund.upsert({
    where: { refundNo: 'PRF20260001' },
    create: {
      refundNo: 'PRF20260001',
      customerId: customers[4].id,
      amount: 8000,
      reason: 'Treatment discontinued',
      status: 'APPROVED',
      createdById: bmId,
    },
    update: {},
  });

  await prisma.cashDeposit.upsert({
    where: { depositNo: 'CD20260001' },
    create: {
      depositNo: 'CD20260001',
      customerId: customers[0].id,
      branchId: branchHair.id,
      amount: 125000,
      purpose: 'Treatment advance deposit',
      createdById: bmId,
    },
    update: {},
  });

  await prisma.advanceReceipt.upsert({
    where: { receiptNo: 'ADV20260001' },
    create: {
      receiptNo: 'ADV20260001',
      customerId: customers[5].id,
      branchId: branchSkin.id,
      amount: 10000,
      balanceAmount: 10000,
      createdById: consultantSkin.id,
    },
    update: {},
  });

  const notifCount = await prisma.notificationLog.count();
  if (notifCount < 2) {
    await prisma.notificationLog.createMany({
      data: [
        { type: 'SMS', recipient: customers[0].phone, message: 'Your appointment is confirmed for tomorrow.', status: 'SENT', module: 'APPOINTMENTS' },
        { type: 'EMAIL', recipient: customers[1].email || 'deepa@email.com', subject: 'Treatment feedback', message: 'Please share your feedback.', status: 'SENT', module: 'CUSTOMER' },
      ],
    });
  }

  const bioCount = await prisma.biometricLog.count();
  if (bioCount === 0) {
    await prisma.biometricLog.createMany({
      data: [
        { userId: bmId, branchId: branchHair.id, punchType: 'IN', punchedAt: new Date() },
        { userId: consultantHair.id, branchId: branchHair.id, punchType: 'IN', punchedAt: new Date(Date.now() - 3600000) },
      ],
    });
  }

  await prisma.incentiveUpload.upsert({
    where: { id: 'inc-upload-001' },
    create: { id: 'inc-upload-001', periodMonth: month, periodYear: year, notes: 'June incentive sheet', uploadedById: adminId, status: 'CALCULATED', totalAmount: 12500 },
    update: { status: 'CALCULATED', totalAmount: 12500 },
  });

  await prisma.incentivePayout.upsert({
    where: { payoutNo: 'INC-PAY-001' },
    create: {
      payoutNo: 'INC-PAY-001',
      uploadId: 'inc-upload-001',
      consultantId: consultantHair.id,
      periodMonth: month,
      periodYear: year,
      amount: 7500,
      status: 'CALCULATED',
    },
    update: {},
  });
  await prisma.incentivePayout.upsert({
    where: { payoutNo: 'INC-PAY-002' },
    create: {
      payoutNo: 'INC-PAY-002',
      uploadId: 'inc-upload-001',
      consultantId: consultantSkin.id,
      periodMonth: month,
      periodYear: year,
      amount: 5000,
      status: 'APPROVED',
      approvedById: accountsId,
    },
    update: {},
  });

  const yesterday = new Date(Date.now() - 86400000);
  yesterday.setHours(0, 0, 0, 0);
  await prisma.dayClose.upsert({
    where: { closeNo: 'DC-HAIR-001' },
    create: {
      closeNo: 'DC-HAIR-001',
      branchId: branchHair.id,
      closeDate: yesterday,
      billsTotal: 125000,
      collectionsTotal: 118500,
      cashCollections: 45000,
      cardCollections: 35000,
      upiCollections: 28500,
      bankCollections: 10000,
      systemCash: 44800,
      physicalCash: 45000,
      variance: 200,
      gstOutput: 18500,
      status: 'SUBMITTED',
      closedById: bmId,
      notes: 'Demo day close awaiting accounts approval',
    },
    update: { status: 'SUBMITTED' },
  });
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
  twoDaysAgo.setHours(0, 0, 0, 0);
  await prisma.dayClose.upsert({
    where: { closeNo: 'DC-HAIR-002' },
    create: {
      closeNo: 'DC-HAIR-002',
      branchId: branchHair.id,
      closeDate: twoDaysAgo,
      billsTotal: 98000,
      collectionsTotal: 98000,
      cashCollections: 30000,
      cardCollections: 40000,
      upiCollections: 28000,
      systemCash: 29850,
      physicalCash: 30000,
      variance: 150,
      gstOutput: 14200,
      status: 'LOCKED',
      closedById: bmId,
      approvedById: accountsId,
      approvedAt: new Date(),
    },
    update: {},
  });

  console.log('  ✓ Extended dummy data seeded');
}
