import { Router } from 'express';
import { requireGuest, requireAuth } from '../middleware/auth.js';
import { authenticateUser } from '../services/authService.js';
import { logAudit } from '../utils/audit.js';
import { config } from '../config/index.js';
import { demoLogins } from '../config/demoLogins.js';

const router = Router();

function loginViewData(extra = {}) {
  return {
    title: 'Sign In',
    layout: 'layouts/auth.njk',
    ...(config.isDev ? { demoLogins } : {}),
    ...extra,
  };
}

function defaultLandingForRole(roleCode) {
  if (roleCode === 'CORPORATE') return '/portal/corporate';
  return '/dashboard/my-tasks';
}

router.get('/login', requireGuest, (req, res) => {
  res.render('pages/auth/login.njk', loginViewData());
});

router.post('/login', requireGuest, async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip?.replace('::ffff:', '') || '127.0.0.1';

  try {
    const user = await authenticateUser(email, password, ip);
    if (!user) {
      return res.render('pages/auth/login.njk', loginViewData({
        error: 'Invalid email or password',
        email,
      }));
    }

    req.session.user = user;
    const returnTo = req.session.returnTo || defaultLandingForRole(user.roleCode);
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('pages/auth/login.njk', loginViewData({
      error: 'An error occurred. Please try again.',
      email,
    }));
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  await logAudit({
    userId: req.session.user.id,
    action: 'LOGOUT',
    module: 'AUTH',
    ipAddress: req.ip,
  });
  req.session.destroy(() => res.redirect('/auth/login'));
});

export default router;
