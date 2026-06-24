import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { logAudit } from '../utils/audit.js';
import { paginate, buildPagination } from '../utils/helpers.js';
import { htmxRedirect } from '../lib/htmx.js';

const router = Router();
router.use(requireAuth);

router.get('/users', requirePermission('admin.users'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const where = req.query.q
    ? {
        OR: [
          { firstName: { contains: req.query.q } },
          { lastName: { contains: req.query.q } },
          { email: { contains: req.query.q } },
          { employeeId: { contains: req.query.q } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { role: true, designation: true, branch: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.render('pages/admin/users.njk', {
    title: 'User Management',
    activeModule: 'admin',
    users,
    pagination: buildPagination(total, page, limit),
    filters: req.query,
  });
});

router.get('/users/form', requirePermission('admin.users'), async (req, res) => {
  const [roles, branches, designations] = await Promise.all([
    prisma.role.findMany({ orderBy: { level: 'desc' } }),
    prisma.branch.findMany({ where: { isActive: true } }),
    prisma.designation.findMany(),
  ]);
  res.render('partials/forms/user.njk', { roles, branches, designations });
});

router.post('/users', requirePermission('admin.users'), async (req, res) => {
  const { employeeId, email, password, firstName, lastName, phone, roleId, designationId, branchId } = req.body;
  const hash = await bcrypt.hash(password || 'VCare@123', 10);

  const user = await prisma.user.create({
    data: {
      employeeId,
      email: email.toLowerCase(),
      passwordHash: hash,
      firstName,
      lastName,
      phone,
      roleId,
      designationId: designationId || null,
      branchId: branchId || null,
    },
  });

  await logAudit({
    userId: req.session.user.id,
    action: 'CREATE',
    module: 'ADMIN',
    entityType: 'User',
    entityId: user.id,
    ipAddress: req.ip,
  });

  return htmxRedirect(req, res, {
    url: '/admin/users',
    flash: { type: 'success', message: `User ${firstName} ${lastName} created successfully.` },
  });
});

router.post('/users/:id', requirePermission('admin.users'), async (req, res) => {
  const data = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phone: req.body.phone,
    roleId: req.body.roleId,
    designationId: req.body.designationId || null,
    branchId: req.body.branchId || null,
    isActive: req.body.isActive !== 'off',
  };
  await prisma.user.update({ where: { id: req.params.id }, data });
  await logAudit({ userId: req.session.user.id, action: 'UPDATE', module: 'ADMIN', entityType: 'User', entityId: req.params.id, ipAddress: req.ip });
  req.session.flash = { type: 'success', message: 'User updated.' };
  res.redirect('/admin/users');
});

router.post('/users/:id/reset-password', requirePermission('admin.users'), async (req, res) => {
  const hash = await bcrypt.hash(req.body.password || 'VCare@123', 10);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
  req.session.flash = { type: 'success', message: 'Password reset.' };
  res.redirect('/admin/users');
});

router.get('/organogram', requirePermission('admin.organogram'), async (req, res) => {
  const nodes = await prisma.orgNode.findMany({
    include: { user: { include: { role: true, branch: true } }, children: true },
    orderBy: { sortOrder: 'asc' },
  });
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: { role: true, branch: true },
    orderBy: { firstName: 'asc' },
  });

  const tree = buildOrgTree(nodes);
  res.render('pages/admin/organogram.njk', {
    title: 'Organisation Organogram',
    activeModule: 'admin',
    orgTree: tree,
    flatNodes: nodes,
    users,
  });
});

router.post('/organogram', requirePermission('admin.organogram'), async (req, res) => {
  await prisma.orgNode.create({
    data: {
      title: req.body.title,
      designation: req.body.designation,
      department: req.body.department || null,
      parentId: req.body.parentId || null,
      userId: req.body.userId || null,
      sortOrder: parseInt(req.body.sortOrder, 10) || 0,
    },
  });
  req.session.flash = { type: 'success', message: 'Organogram node added.' };
  res.redirect('/admin/organogram');
});

router.post('/organogram/:id', requirePermission('admin.organogram'), async (req, res) => {
  await prisma.orgNode.update({
    where: { id: req.params.id },
    data: {
      title: req.body.title,
      designation: req.body.designation,
      department: req.body.department || null,
      parentId: req.body.parentId || null,
      userId: req.body.userId || null,
      sortOrder: parseInt(req.body.sortOrder, 10) || 0,
      isActive: req.body.isActive !== 'off',
    },
  });
  req.session.flash = { type: 'success', message: 'Organogram node updated.' };
  res.redirect('/admin/organogram');
});

function buildOrgTree(nodes) {
  const map = new Map(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

router.get('/roles', requirePermission('admin.roles'), async (req, res) => {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: { level: 'desc' },
  });
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});
  res.render('pages/admin/roles.njk', {
    title: 'Roles & Access Control',
    activeModule: 'admin',
    roles,
    permissions,
    permissionsByModule,
    editRoleId: req.query.role,
  });
});

router.post('/roles/:id/permissions', requirePermission('admin.roles'), async (req, res) => {
  const roleId = req.params.id;
  const permissionIds = Array.isArray(req.body.permissionIds) ? req.body.permissionIds : req.body.permissionIds ? [req.body.permissionIds] : [];

  await prisma.rolePermission.deleteMany({ where: { roleId } });
  for (const permissionId of permissionIds) {
    await prisma.rolePermission.create({ data: { roleId, permissionId } });
  }

  await logAudit({
    userId: req.session.user.id,
    action: 'UPDATE_PERMISSIONS',
    module: 'ADMIN',
    entityType: 'Role',
    entityId: roleId,
    ipAddress: req.ip,
  });

  req.session.flash = { type: 'success', message: 'Role permissions updated.' };
  res.redirect(`/admin/roles?role=${roleId}`);
});

router.get('/ip-whitelist', requirePermission('admin.ip'), async (req, res) => {
  const entries = await prisma.ipWhitelist.findMany({ orderBy: { createdAt: 'desc' } });
  res.render('pages/admin/ip-whitelist.njk', { title: 'IP Whitelist', activeModule: 'admin', entries });
});

router.post('/ip-whitelist', requirePermission('admin.ip'), async (req, res) => {
  await prisma.ipWhitelist.create({
    data: { ipAddress: req.body.ipAddress, description: req.body.description },
  });
  req.session.flash = { type: 'success', message: 'IP address added to whitelist.' };
  res.redirect('/admin/ip-whitelist');
});

router.post('/ip-whitelist/:id/toggle', requirePermission('admin.ip'), async (req, res) => {
  const entry = await prisma.ipWhitelist.findUnique({ where: { id: req.params.id } });
  if (entry) {
    await prisma.ipWhitelist.update({ where: { id: entry.id }, data: { isActive: !entry.isActive } });
    req.session.flash = { type: 'success', message: `IP ${entry.isActive ? 'deactivated' : 'activated'}.` };
  }
  res.redirect('/admin/ip-whitelist');
});

router.post('/ip-whitelist/:id/delete', requirePermission('admin.ip'), async (req, res) => {
  await prisma.ipWhitelist.delete({ where: { id: req.params.id } });
  req.session.flash = { type: 'success', message: 'IP entry removed.' };
  res.redirect('/admin/ip-whitelist');
});

router.get('/online-orders', requirePermission('admin.audit'), async (req, res) => {
  const orders = await prisma.onlineOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  const bills = await prisma.bill.findMany({
    where: { id: { in: orders.filter((o) => o.billId).map((o) => o.billId) } },
    select: { id: true, billNo: true },
  });
  const billMap = Object.fromEntries(bills.map((b) => [b.id, b]));
  res.render('pages/admin/online-orders.njk', {
    title: 'Online Orders',
    activeModule: 'admin',
    orders,
    billMap,
  });
});

router.get('/audit', requirePermission('admin.audit'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page);
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count(),
  ]);
  res.render('pages/admin/audit.njk', {
    title: 'Audit Trail',
    activeModule: 'admin',
    logs,
    pagination: buildPagination(total, page, limit),
  });
});

router.get('/email-config', requirePermission('admin.notifications'), async (req, res) => {
  const config = await prisma.emailConfig.findFirst();
  res.render('pages/admin/email-config.njk', { title: 'Email Configuration', activeModule: 'admin', config });
});

router.post('/email-config', requirePermission('admin.notifications'), async (req, res) => {
  const data = {
    host: req.body.host,
    port: parseInt(req.body.port, 10),
    username: req.body.username,
    password: req.body.password,
    fromEmail: req.body.fromEmail,
    isActive: req.body.isActive === 'on',
  };
  const existing = await prisma.emailConfig.findFirst();
  if (existing) {
    await prisma.emailConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.emailConfig.create({ data });
  }
  req.session.flash = { type: 'success', message: 'Email configuration saved.' };
  res.redirect('/admin/email-config');
});

router.get('/sms-config', requirePermission('admin.notifications'), async (req, res) => {
  const config = await prisma.smsConfig.findFirst();
  const notifications = await prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  res.render('pages/admin/sms-config.njk', {
    title: 'SMS Configuration',
    activeModule: 'admin',
    config,
    notifications,
  });
});

router.post('/sms-config', requirePermission('admin.notifications'), async (req, res) => {
  const data = {
    provider: req.body.provider,
    apiKey: req.body.apiKey,
    senderId: req.body.senderId,
    isActive: req.body.isActive === 'on',
  };
  const existing = await prisma.smsConfig.findFirst();
  if (existing) {
    await prisma.smsConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.smsConfig.create({ data });
  }
  req.session.flash = { type: 'success', message: 'SMS configuration saved.' };
  res.redirect('/admin/sms-config');
});

export default router;
