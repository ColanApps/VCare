export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
}

export function requireGuest(req, res, next) {
  if (req.session?.user) {
    return res.redirect('/dashboard');
  }
  next();
}

export function attachUser(req, res, next) {
  res.locals.user = req.session?.user || null;
  res.locals.isAuthenticated = !!req.session?.user;
  next();
}
