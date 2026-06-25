import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import session from 'express-session';
import nunjucks from 'nunjucks';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/index.js';
import { attachUser, requireAuth } from './middleware/auth.js';
import { viewHelpers } from './middleware/viewHelpers.js';
import { shellContext } from './middleware/shellContext.js';
import { checkIpWhitelist } from './middleware/rbac.js';
import { formatCurrency, formatDate, formatDateTime, getStatusColor } from './utils/helpers.js';
import { createSessionStore, getSessionCookieOptions } from './lib/sessionStore.js';
import { uploadRoot } from './middleware/upload.js';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import masterRoutes from './routes/master.js';
import customerRoutes from './routes/customer.js';
import appointmentRoutes from './routes/appointments.js';
import billingRoutes from './routes/billing.js';
import inventoryRoutes from './routes/inventory.js';
import purchaseRoutes from './routes/purchase.js';
import operationsRoutes from './routes/operations.js';
import reportsRoutes from './routes/reports.js';
import callCenterRoutes from './routes/callCenter.js';
import warehouseRoutes from './routes/warehouse.js';
import portalRoutes from './routes/portal.js';
import treatmentRoutes from './routes/treatment.js';
import salesRoutes from './routes/sales.js';
import purchaseWorkflowRoutes from './routes/purchaseWorkflows.js';
import registryWorkflowRoutes from './routes/registryWorkflows.js';
import screensRoutes from './routes/screens.js';
import financeRoutes from './routes/finance.js';
import clinicalRoutes from './routes/clinical.js';
import apiRoutes from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Render/Railway sit behind reverse proxies — trust X-Forwarded-For for client IP
app.set('trust proxy', true);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: createSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: getSessionCookieOptions(),
  })
);

const env = nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true,
  express: app,
  watch: config.isDev,
});

env.addFilter('currency', formatCurrency);
env.addFilter('date', formatDate);
env.addFilter('datetime', formatDateTime);
env.addFilter('statusColor', getStatusColor);
env.addFilter('json', (v) => JSON.stringify(v));
env.addFilter('lower', (s) => (s || '').toLowerCase());
env.addFilter('upper', (s) => (s || '').toUpperCase());
env.addFilter('truncate', (s, len = 50) => (s && s.length > len ? s.slice(0, len) + '…' : s));
env.addFilter('number', (n) => new Intl.NumberFormat('en-IN').format(n || 0));
env.addFilter('round', (n, d = 0) => Number(n || 0).toFixed(d));
env.addGlobal('appName', 'VCare ERP');
env.addGlobal('appVersion', '1.0.0');
env.addGlobal('isDev', config.isDev);

app.set('view engine', 'njk');

app.use(attachUser);
app.use(viewHelpers);
app.use(checkIpWhitelist);

app.get('/uploads/:category/:filename', requireAuth, (req, res) => {
  const { category, filename } = req.params;
  const safeName = path.basename(filename);
  const filePath = path.join(uploadRoot, category, safeName);
  if (!filePath.startsWith(path.join(uploadRoot, category))) {
    return res.status(400).send('Invalid path');
  }
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  return res.sendFile(filePath);
});

app.use('/auth', authRoutes);
app.use('/api/v1', apiRoutes);

app.use(requireAuth);
app.use(shellContext);
app.use(purchaseWorkflowRoutes);
app.use(registryWorkflowRoutes);
app.use('/operations', operationsRoutes);
app.use(screensRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/master', masterRoutes);
app.use('/customer', customerRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/billing', billingRoutes);
app.use('/finance', financeRoutes);
app.use('/clinical', clinicalRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/call-center', callCenterRoutes);
app.use('/warehouse', warehouseRoutes);
app.use('/portal', portalRoutes);
app.use('/customer/treatment', treatmentRoutes);
app.use('/sales', salesRoutes);
app.use('/reports', reportsRoutes);

app.get('/', (req, res) => res.redirect('/dashboard/my-tasks'));

app.use((req, res) => {
  res.status(404).render('pages/error.njk', {
    title: 'Page Not Found',
    code: 404,
    message: 'The requested page could not be found.',
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('pages/error.njk', {
    title: 'Server Error',
    code: 500,
    message: config.isDev ? err.message : 'An unexpected error occurred.',
  });
});

export default app;
