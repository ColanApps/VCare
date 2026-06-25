import { prisma } from '../lib/prisma.js';

export function requirePermission(...permissions) {
  return (req, res, next) => {
    const userPerms = req.session?.user?.permissions || [];
    if (userPerms.includes('*')) return next();

    const allowed = permissions.some((p) => userPerms.includes(p));
    if (!allowed) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      return res.status(403).render('pages/error.njk', {
        title: 'Access Denied',
        code: 403,
        message: 'You do not have permission to access this module.',
      });
    }
    next();
  };
}

export async function checkIpWhitelist(req, res, next) {
  if (process.env.NODE_ENV === 'development') return next();
  if (process.env.IP_WHITELIST_ENFORCE === 'false') return next();

  const ip = req.ip?.replace('::ffff:', '') || req.connection.remoteAddress;
  const whitelist = await prisma.ipWhitelist.findMany({ where: { isActive: true } });

  if (whitelist.length === 0) return next();

  const allowed = whitelist.some((w) => w.ipAddress === ip || w.ipAddress === '*');
  if (!allowed) {
    return res.status(403).render('pages/error.njk', {
      title: 'Access Restricted',
      code: 403,
      message: `Your IP address (${ip}) is not authorized to access this system.`,
    });
  }
  next();
}

export function branchScope(req, res, next) {
  const user = req.session?.user;
  if (!user) return next();

  if (user.roleCode === 'SUPER_ADMIN' || user.roleCode === 'CORPORATE') {
    req.branchFilter = {};
  } else if (user.branchId) {
    req.branchFilter = { branchId: user.branchId };
  } else {
    req.branchFilter = {};
  }
  next();
}
