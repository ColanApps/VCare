import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';

import { requirePermission, branchScope } from '../middleware/rbac.js';

import { registryScreens } from '../config/screenRegistry.js';

import { getScreenData, createMasterRecord, updateMasterRecord, deleteMasterRecord } from '../services/screenDataService.js';
import { rowsToCsv } from '../services/registryDepthService.js';

import { prisma } from '../lib/prisma.js';

import { isHtmx, redirectOrHtmx } from '../lib/htmx.js';



const router = Router();

router.use(requireAuth, branchScope);



for (const screen of registryScreens) {

  router.get(screen.path, requirePermission(screen.permission), async (req, res) => {

    try {

      const data = await getScreenData(screen, req);

      if (data.portalRedirect && data.portalRedirect !== screen.path) {
        return res.redirect(data.portalRedirect);
      }

      const template = screen.type === 'master' ? 'pages/generic/master.njk'

        : screen.type === 'dashboard' ? 'pages/generic/dashboard.njk'

        : screen.type === 'form' ? 'pages/generic/form.njk'

        : 'pages/generic/report.njk';



      const needsPeriod = screen.type === 'report' || screen.type === 'dashboard';

      const branches = needsPeriod

        ? await prisma.branch.findMany({ where: { isActive: true, type: { not: 'WAREHOUSE' } } })

        : undefined;



      res.render(template, {

        title: screen.title,

        activeModule: screen.module,

        screen,

        branches,

        filters: { branchId: req.query.branchId || '' },

        user: req.session.user,

        ...data,

      });

    } catch (err) {

      console.error(`Screen ${screen.id}:`, err);

      res.status(500).render('pages/error.njk', { title: 'Error', code: 500, message: err.message });

    }

  });



  if (screen.type === 'report' || screen.type === 'dashboard') {

    router.get(`${screen.path}/export`, requirePermission(screen.permission), async (req, res) => {

      try {

        const data = await getScreenData(screen, req);

        const csv = rowsToCsv(data.columns || [], data.rows || []);

        res.setHeader('Content-Type', 'text/csv');

        res.setHeader('Content-Disposition', `attachment; filename="${screen.id}.csv"`);

        res.send(csv);

      } catch (err) {

        res.status(500).send(err.message);

      }

    });

  }



  if (screen.type === 'master' && screen.model) {

    router.get(`${screen.path}/form`, requirePermission(screen.permission), async (req, res) => {

      try {

        const data = await getScreenData(screen, req);

        res.render('partials/master-form.njk', { screen, fields: data.fields, ...data });

      } catch (err) {

        res.status(500).send(err.message);

      }

    });



    router.post(screen.path, requirePermission(screen.permission), async (req, res) => {

      try {

        await createMasterRecord(screen.model, req.body, req.session.user);

        const data = await getScreenData(screen, req);

        return redirectOrHtmx(req, res, {

          redirect: screen.path,

          render: 'partials/master-table-rows.njk',

          data: { fields: data.fields, rows: data.rows, screen },

          flash: { type: 'success', message: 'Record saved.' },

          triggers: { 'erp-close-modal': true },

        });

      } catch (err) {

        return redirectOrHtmx(req, res, {

          redirect: screen.path,

          flash: { type: 'error', message: err.message },

        });

      }

    });



    router.get(`${screen.path}/:id/form`, requirePermission(screen.permission), async (req, res) => {

      try {

        const model = prisma[screen.model];

        const record = await model.findUnique({ where: { id: req.params.id } });

        if (!record) return res.status(404).send('Record not found');

        const data = await getScreenData(screen, req);

        res.render('partials/master-form.njk', { screen, fields: data.fields, record, ...data });

      } catch (err) {

        res.status(500).send(err.message);

      }

    });



    router.post(`${screen.path}/:id`, requirePermission(screen.permission), async (req, res) => {

      try {

        await updateMasterRecord(screen.model, req.params.id, req.body);

        const data = await getScreenData(screen, req);

        return redirectOrHtmx(req, res, {

          redirect: screen.path,

          render: 'partials/master-table-rows.njk',

          data: { fields: data.fields, rows: data.rows, screen },

          flash: { type: 'success', message: 'Record updated.' },

          triggers: { 'erp-close-modal': true },

        });

      } catch (err) {

        return redirectOrHtmx(req, res, {

          redirect: screen.path,

          flash: { type: 'error', message: err.message },

        });

      }

    });



    router.post(`${screen.path}/:id/delete`, requirePermission(screen.permission), async (req, res) => {

      try {

        await deleteMasterRecord(screen.model, req.params.id);

        const data = await getScreenData(screen, req);

        return redirectOrHtmx(req, res, {

          redirect: screen.path,

          render: 'partials/master-table-rows.njk',

          data: { fields: data.fields, rows: data.rows, screen },

          flash: { type: 'success', message: 'Record deleted.' },

        });

      } catch (err) {

        return redirectOrHtmx(req, res, {

          redirect: screen.path,

          flash: { type: 'error', message: err.message },

        });

      }

    });

  }

}



router.get('/appointments/fix-new/form', requirePermission('appointments.create'), async (req, res) => {

  const [customers, branches, consultants] = await Promise.all([

    prisma.customer.findMany({ take: 200, orderBy: { registeredAt: 'desc' } }),

    prisma.branch.findMany({ where: { isActive: true } }),

    prisma.user.findMany({ where: { role: { name: 'CONSULTANT' }, isActive: true }, take: 50 }),

  ]);

  res.render('partials/forms/fix-appointment.njk', { customers, branches, consultants, user: req.session.user });

});



router.post('/appointments/fix-new', requirePermission('appointments.create'), async (req, res) => {

  try {

    await prisma.appointment.create({

      data: {

        customerId: req.body.customerId,

        branchId: req.body.branchId || req.session.user.branchId,

        consultantId: req.body.consultantId || req.session.user.id,

        type: req.body.type || 'CONSULTATION',

        scheduledAt: new Date(req.body.scheduledAt),

        status: 'SCHEDULED',

        source: 'WALK_IN',

      },

    });

    return redirectOrHtmx(req, res, {

      redirect: '/appointments',

      flash: { type: 'success', message: 'Appointment created.' },

      triggers: { 'erp-close-modal': true },

    });

  } catch (err) {

    return redirectOrHtmx(req, res, {

      redirect: '/appointments/fix-new',

      flash: { type: 'error', message: err.message },

    });

  }

});



export default router;

