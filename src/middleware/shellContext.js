import { getTaskCounts } from '../services/taskQueueService.js';

function inferModuleFromPath(pathname) {
  const seg = (pathname.split('/').filter(Boolean)[0] || 'dashboard');
  const map = {
    dashboard: 'dashboard',
    admin: 'admin',
    master: 'master',
    customer: 'customer',
    appointments: 'appointments',
    'call-center': 'callcenter',
    billing: 'billing',
    finance: 'finance',
    sales: 'sales',
    inventory: 'inventory',
    warehouse: 'warehouse',
    portal: 'portal',
    purchase: 'purchase',
    operations: 'operations',
    reports: 'reports',
    clinical: 'customer',
  };
  return map[seg] || 'dashboard';
}

export async function shellContext(req, res, next) {
  if (!req.session?.user) return next();

  res.locals.activeModule = res.locals.activeModule || inferModuleFromPath(req.path);

  try {
    const branchFilter = req.branchFilter ?? (req.session.user.branchId ? { branchId: req.session.user.branchId } : {});
    res.locals.taskCount = await getTaskCounts(req.session.user, branchFilter);
  } catch {
    res.locals.taskCount = 0;
  }

  return next();
}
