import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { redirectOrHtmx, isHtmx, htmxRedirect } from '../lib/htmx.js';
import { enrichTargetsWithAchievement } from '../services/targetService.js';
import { parseReportPeriod } from '../utils/reportFilters.js';

const router = Router();
router.use(requireAuth);

router.get('/geography', requirePermission('master.geography'), async (req, res) => {
  const [countries, states] = await Promise.all([
    prisma.country.findMany({ include: { states: { include: { cities: { include: { areas: true } } } } } }),
    prisma.state.findMany({ include: { country: true } }),
  ]);
  res.render('pages/master/geography.njk', { title: 'Geographical Master', activeModule: 'master', countries, states });
});

router.post('/geography/country', requirePermission('master.geography'), async (req, res) => {
  await prisma.country.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name } });
  req.session.flash = { type: 'success', message: 'Country added.' };
  res.redirect('/master/geography');
});

router.post('/geography/state', requirePermission('master.geography'), async (req, res) => {
  await prisma.state.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name, countryId: req.body.countryId } });
  req.session.flash = { type: 'success', message: 'State added.' };
  res.redirect('/master/geography');
});

router.post('/geography/city', requirePermission('master.geography'), async (req, res) => {
  await prisma.city.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name, stateId: req.body.stateId } });
  req.session.flash = { type: 'success', message: 'City added.' };
  res.redirect('/master/geography');
});

router.post('/geography/area', requirePermission('master.geography'), async (req, res) => {
  await prisma.area.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name, cityId: req.body.cityId } });
  req.session.flash = { type: 'success', message: 'Area added.' };
  res.redirect('/master/geography');
});

router.post('/geography/:level/:id/edit', requirePermission('master.geography'), async (req, res) => {
  const { level, id } = req.params;
  const data = { name: req.body.name };
  if (req.body.code) data.code = req.body.code.toUpperCase();

  const models = { country: prisma.country, state: prisma.state, city: prisma.city, area: prisma.area };
  const model = models[level];
  if (!model) return res.status(400).redirect('/master/geography');

  await model.update({ where: { id }, data });
  req.session.flash = { type: 'success', message: `${level} updated.` };
  res.redirect('/master/geography');
});

router.post('/geography/:level/:id/delete', requirePermission('master.geography'), async (req, res) => {
  const { level, id } = req.params;
  try {
    const models = { country: prisma.country, state: prisma.state, city: prisma.city, area: prisma.area };
    const model = models[level];
    if (!model) throw new Error('Invalid level');
    await model.delete({ where: { id } });
    req.session.flash = { type: 'success', message: `${level} deleted.` };
  } catch (err) {
    req.session.flash = { type: 'error', message: `Cannot delete — child records may exist.` };
  }
  res.redirect('/master/geography');
});

router.post('/zones', requirePermission('master.branches'), async (req, res) => {
  await prisma.zone.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name } });
  req.session.flash = { type: 'success', message: 'Zone created.' };
  res.redirect('/master/branches');
});

router.post('/branches/:id', requirePermission('master.branches'), async (req, res) => {
  await prisma.branch.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      type: req.body.type,
      address: req.body.address,
      cityId: req.body.cityId || null,
      zoneId: req.body.zoneId || null,
      phone: req.body.phone,
      email: req.body.email,
      isActive: req.body.isActive !== 'off',
    },
  });
  req.session.flash = { type: 'success', message: 'Branch updated.' };
  res.redirect('/master/branches');
});

router.get('/branches/form', requirePermission('master.branches'), async (req, res) => {
  const [zones, cities] = await Promise.all([prisma.zone.findMany(), prisma.city.findMany()]);
  res.render('partials/forms/branch.njk', { zones, cities });
});

router.get('/branches', requirePermission('master.branches'), async (req, res) => {
  const [branches, zones, cities] = await Promise.all([
    prisma.branch.findMany({ include: { zone: true, city: true } }),
    prisma.zone.findMany(),
    prisma.city.findMany(),
  ]);
  res.render('pages/master/branches.njk', { title: 'Branches & Zones', activeModule: 'master', branches, zones, cities });
});

router.post('/branches', requirePermission('master.branches'), async (req, res) => {
  await prisma.branch.create({
    data: {
      code: req.body.code,
      name: req.body.name,
      type: req.body.type,
      address: req.body.address,
      cityId: req.body.cityId || null,
      zoneId: req.body.zoneId || null,
      phone: req.body.phone,
      email: req.body.email,
    },
  });
  return htmxRedirect(req, res, {
    url: '/master/branches',
    flash: { type: 'success', message: 'Branch created.' },
  });
});

router.get('/treatments/form', requirePermission('master.treatments'), async (req, res) => {
  res.render('partials/forms/treatment.njk', {});
});

router.get('/treatments', requirePermission('master.treatments'), async (req, res) => {
  const treatments = await prisma.treatment.findMany({ orderBy: { name: 'asc' } });
  res.render('pages/master/treatments.njk', { title: 'Treatment Master', activeModule: 'master', treatments });
});

router.post('/treatments', requirePermission('master.treatments'), async (req, res) => {
  await prisma.treatment.create({
    data: {
      code: req.body.code,
      name: req.body.name,
      category: req.body.category,
      duration: parseInt(req.body.duration, 10) || 60,
      basePrice: parseFloat(req.body.basePrice) || 0,
      description: req.body.description,
    },
  });
  return htmxRedirect(req, res, {
    url: '/master/treatments',
    flash: { type: 'success', message: 'Treatment added.' },
  });
});

router.post('/treatments/:id', requirePermission('master.treatments'), async (req, res) => {
  await prisma.treatment.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      category: req.body.category,
      duration: parseInt(req.body.duration, 10) || 60,
      basePrice: parseFloat(req.body.basePrice) || 0,
      description: req.body.description,
      isActive: req.body.isActive !== 'off',
    },
  });
  req.session.flash = { type: 'success', message: 'Treatment updated.' };
  res.redirect('/master/treatments');
});

router.get('/diagnosis', requirePermission('master.diagnosis'), async (req, res) => {
  const diagnoses = await prisma.diagnosis.findMany({ orderBy: { name: 'asc' } });
  res.render('pages/master/diagnosis.njk', { title: 'Diagnosis Master', activeModule: 'master', diagnoses });
});

router.post('/diagnosis', requirePermission('master.diagnosis'), async (req, res) => {
  await prisma.diagnosis.create({
    data: { code: req.body.code, name: req.body.name, category: req.body.category || 'HAIR', description: req.body.description },
  });
  req.session.flash = { type: 'success', message: 'Diagnosis added.' };
  res.redirect('/master/diagnosis');
});

router.post('/diagnosis/:id', requirePermission('master.diagnosis'), async (req, res) => {
  await prisma.diagnosis.update({
    where: { id: req.params.id },
    data: { name: req.body.name, category: req.body.category, description: req.body.description },
  });
  req.session.flash = { type: 'success', message: 'Diagnosis updated.' };
  res.redirect('/master/diagnosis');
});

router.get('/designations', requirePermission('master.designations'), async (req, res) => {
  const [designations, grades] = await Promise.all([
    prisma.designation.findMany({ include: { grade: true } }),
    prisma.grade.findMany(),
  ]);
  res.render('pages/master/designations.njk', { title: 'Designations', activeModule: 'master', designations, grades });
});

router.post('/designations', requirePermission('master.designations'), async (req, res) => {
  await prisma.designation.create({
    data: { code: req.body.code, name: req.body.name, gradeId: req.body.gradeId || null },
  });
  req.session.flash = { type: 'success', message: 'Designation added.' };
  res.redirect('/master/designations');
});

router.post('/grades', requirePermission('master.designations'), async (req, res) => {
  await prisma.grade.create({ data: { code: req.body.code, name: req.body.name, level: parseInt(req.body.level, 10) || 1 } });
  req.session.flash = { type: 'success', message: 'Grade added.' };
  res.redirect('/master/designations');
});

router.get('/targets', requirePermission('master.targets'), async (req, res) => {
  const period = parseReportPeriod(req.query);
  const targets = await prisma.locationTarget.findMany({
    where: { month: period.month, year: period.year },
    include: { branch: true },
  });
  const targetsWithAchievement = await enrichTargetsWithAchievement(targets, period.from, period.to);
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  res.render('pages/master/targets.njk', {
    title: 'Location Targets',
    activeModule: 'master',
    targets: targetsWithAchievement,
    branches,
    month: period.month,
    year: period.year,
  });
});

router.post('/targets', requirePermission('master.targets'), async (req, res) => {
  const { branchId, month, year, target } = req.body;
  await prisma.locationTarget.upsert({
    where: { branchId_month_year: { branchId, month: parseInt(month, 10), year: parseInt(year, 10) } },
    create: { branchId, month: parseInt(month, 10), year: parseInt(year, 10), target: parseFloat(target) },
    update: { target: parseFloat(target) },
  });
  req.session.flash = { type: 'success', message: 'Target updated.' };
  res.redirect('/master/targets');
});

router.get('/tickets', requirePermission('master.tickets'), async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    include: { createdBy: true, assignedTo: true, branch: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.render('pages/master/tickets.njk', { title: 'Tickets', activeModule: 'master', tickets });
});

router.get('/discounts', requirePermission('master.discounts'), async (req, res) => {
  const [rules, schemes, limits, products, treatments] = await Promise.all([
    prisma.discountRule.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.schemeOffer.findMany({ orderBy: { validFrom: 'desc' } }),
    prisma.maxDiscountLimit.findMany(),
    prisma.product.findMany({ where: { isActive: true }, take: 50 }),
    prisma.treatment.findMany({ where: { isActive: true }, take: 50 }),
  ]);
  res.render('pages/master/discounts.njk', {
    title: 'Discount & Scheme Master',
    activeModule: 'master',
    rules,
    schemes,
    limits,
    products,
    treatments,
  });
});

router.post('/discounts/rule', requirePermission('master.discounts'), async (req, res) => {
  await prisma.discountRule.create({
    data: {
      code: req.body.code,
      name: req.body.name,
      type: req.body.type,
      category: req.body.category || 'ALL',
      targetScope: req.body.targetScope || 'ALL',
      targetId: req.body.targetId || null,
      discountPercent: parseFloat(req.body.discountPercent),
      maxAmount: req.body.maxAmount ? parseFloat(req.body.maxAmount) : null,
      validFrom: req.body.validFrom ? new Date(req.body.validFrom) : null,
      validTo: req.body.validTo ? new Date(req.body.validTo) : null,
    },
  });
  req.session.flash = { type: 'success', message: 'Discount rule created.' };
  res.redirect('/master/discounts');
});

router.post('/discounts/scheme', requirePermission('master.discounts'), async (req, res) => {
  await prisma.schemeOffer.create({
    data: {
      code: req.body.code,
      name: req.body.name,
      itemType: req.body.itemType,
      category: req.body.category || 'ALL',
      itemCode: req.body.itemCode || null,
      discountPercent: parseFloat(req.body.discountPercent),
      validFrom: new Date(req.body.validFrom),
      validTo: new Date(req.body.validTo),
    },
  });
  req.session.flash = { type: 'success', message: 'Scheme offer created.' };
  res.redirect('/master/discounts');
});

router.post('/discounts/limit', requirePermission('master.discounts'), async (req, res) => {
  await prisma.maxDiscountLimit.upsert({
    where: { type_category: { type: req.body.type, category: req.body.category } },
    create: { type: req.body.type, category: req.body.category, maxPercent: parseFloat(req.body.maxPercent) },
    update: { maxPercent: parseFloat(req.body.maxPercent) },
  });
  req.session.flash = { type: 'success', message: 'Max discount limit saved.' };
  res.redirect('/master/discounts');
});

router.post('/discounts/rule/:id/toggle', requirePermission('master.discounts'), async (req, res) => {
  const rule = await prisma.discountRule.findUnique({ where: { id: req.params.id } });
  if (rule) {
    await prisma.discountRule.update({ where: { id: rule.id }, data: { isActive: !rule.isActive } });
    req.session.flash = { type: 'success', message: `Discount rule ${rule.isActive ? 'deactivated' : 'activated'}.` };
  }
  res.redirect('/master/discounts');
});

router.post('/discounts/scheme/:id/toggle', requirePermission('master.discounts'), async (req, res) => {
  const scheme = await prisma.schemeOffer.findUnique({ where: { id: req.params.id } });
  if (scheme) {
    await prisma.schemeOffer.update({ where: { id: scheme.id }, data: { isActive: !scheme.isActive } });
    req.session.flash = { type: 'success', message: `Scheme ${scheme.isActive ? 'deactivated' : 'activated'}.` };
  }
  res.redirect('/master/discounts');
});

router.get('/reference', requirePermission('master.reference'), async (req, res) => {
  const [occupations, knownByList, surgeons, banks, companies, therapists, branches] = await Promise.all([
    prisma.occupation.findMany({ orderBy: { name: 'asc' } }),
    prisma.knownBy.findMany({ orderBy: { name: 'asc' } }),
    prisma.surgeon.findMany({ orderBy: { name: 'asc' } }),
    prisma.bank.findMany({ orderBy: { name: 'asc' } }),
    prisma.company.findMany({ orderBy: { name: 'asc' } }),
    prisma.therapist.findMany({ orderBy: { name: 'asc' } }),
    prisma.branch.findMany({ where: { isActive: true } }),
  ]);
  res.render('pages/master/reference.njk', {
    title: 'Reference Data Masters',
    activeModule: 'master',
    occupations,
    knownByList,
    surgeons,
    banks,
    companies,
    therapists,
    branches,
  });
});

router.post('/reference/occupation', requirePermission('master.reference'), async (req, res) => {
  await prisma.occupation.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name } });
  req.session.flash = { type: 'success', message: 'Occupation added.' };
  res.redirect('/master/reference');
});

router.post('/reference/known-by', requirePermission('master.reference'), async (req, res) => {
  await prisma.knownBy.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name } });
  req.session.flash = { type: 'success', message: 'Known By source added.' };
  res.redirect('/master/reference');
});

router.post('/reference/surgeon', requirePermission('master.reference'), async (req, res) => {
  await prisma.surgeon.create({ data: { code: req.body.code.toUpperCase(), name: req.body.name, specialty: req.body.specialty } });
  req.session.flash = { type: 'success', message: 'Surgeon added.' };
  res.redirect('/master/reference');
});

router.post('/reference/bank', requirePermission('master.reference'), async (req, res) => {
  await prisma.bank.create({
    data: {
      code: req.body.code.toUpperCase(),
      name: req.body.name,
      accountNumber: req.body.accountNumber,
      ifscCode: req.body.ifscCode,
      branchName: req.body.branchName,
    },
  });
  req.session.flash = { type: 'success', message: 'Bank account added.' };
  res.redirect('/master/reference');
});

router.post('/reference/company', requirePermission('master.reference'), async (req, res) => {
  await prisma.company.create({
    data: { code: req.body.code.toUpperCase(), name: req.body.name, gstin: req.body.gstin, address: req.body.address },
  });
  req.session.flash = { type: 'success', message: 'Company added.' };
  res.redirect('/master/reference');
});

router.post('/reference/therapist', requirePermission('master.reference'), async (req, res) => {
  await prisma.therapist.create({
    data: {
      code: req.body.code.toUpperCase(),
      name: req.body.name,
      specialty: req.body.specialty,
      branchId: req.body.branchId || null,
    },
  });
  req.session.flash = { type: 'success', message: 'Therapist added.' };
  res.redirect('/master/reference');
});

router.post('/reference/corporate-customer', requirePermission('master.reference'), async (req, res) => {
  const { generateNumber } = await import('../utils/helpers.js');
  const uhid = await generateNumber('CORP', 'customer', 'uhid');
  const branchId = req.body.branchId || req.session.user.branchId;
  await prisma.customer.create({
    data: {
      uhid,
      firstName: req.body.companyName,
      lastName: '(Corporate)',
      phone: req.body.phone,
      email: req.body.email,
      companyName: req.body.companyName,
      gstin: req.body.gstin,
      customerType: 'CORPORATE',
      branchId,
      category: req.body.category || 'HAIR',
    },
  });
  req.session.flash = { type: 'success', message: `Corporate account ${uhid} created.` };
  res.redirect('/master/reference');
});

const referenceUpdateRoutes = {
  occupation: (body) => ({ name: body.name }),
  'known-by': (body) => ({ name: body.name }),
  surgeon: (body) => ({ name: body.name, specialty: body.specialty }),
  bank: (body) => ({ name: body.name, accountNumber: body.accountNumber, ifscCode: body.ifscCode, branchName: body.branchName }),
  company: (body) => ({ name: body.name, gstin: body.gstin, address: body.address }),
  therapist: (body) => ({ name: body.name, specialty: body.specialty, branchId: body.branchId || null }),
};

for (const [entity, mapper] of Object.entries(referenceUpdateRoutes)) {
  router.post(`/reference/${entity}/:id`, requirePermission('master.reference'), async (req, res) => {
    const models = {
      occupation: prisma.occupation,
      'known-by': prisma.knownBy,
      surgeon: prisma.surgeon,
      bank: prisma.bank,
      company: prisma.company,
      therapist: prisma.therapist,
    };
    await models[entity].update({ where: { id: req.params.id }, data: mapper(req.body) });
    req.session.flash = { type: 'success', message: 'Record updated.' };
    res.redirect('/master/reference');
  });
}

export default router;
