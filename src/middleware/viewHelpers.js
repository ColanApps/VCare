import { formatCurrency, formatDate, formatDateTime, getStatusColor } from '../utils/helpers.js';
import { getFilteredNavigation, getBreadcrumbs } from '../config/navigation.js';

export function viewHelpers(req, res, next) {
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDate = formatDate;
  res.locals.formatDateTime = formatDateTime;
  res.locals.getStatusColor = getStatusColor;
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  if (req.session?.user) {
    res.locals.navigation = getFilteredNavigation(req.session.user.permissions);
    res.locals.breadcrumbs = getBreadcrumbs(req.path);
  }

  res.locals.setFlash = (type, message) => {
    req.session.flash = { type, message };
  };

  next();
}

export function flashMiddleware(req, res, next) {
  res.flash = (type, message) => {
    req.session.flash = { type, message };
  };
  next();
}
