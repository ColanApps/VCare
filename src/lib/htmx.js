export function isHtmx(req) {
  return req.headers['hx-request'] === 'true';
}

export function htmxTrigger(res, events) {
  res.set('HX-Trigger', JSON.stringify(events));
}

export function htmxRedirect(req, res, { url, flash, triggers = {} }) {
  if (!isHtmx(req)) {
    if (flash) req.session.flash = flash;
    return res.redirect(url);
  }
  const events = { ...triggers, 'erp-close-modal': true };
  if (flash) events['erp-flash'] = flash;
  htmxTrigger(res, events);
  res.set('HX-Redirect', url);
  return res.status(204).end();
}

export function redirectOrHtmx(req, res, { redirect, render, data, flash, triggers = {} }) {
  if (isHtmx(req)) {
    const events = { ...triggers };
    if (flash) events['erp-flash'] = flash;
    if (render) {
      if (Object.keys(events).length) htmxTrigger(res, events);
      return res.render(render, data);
    }
    if (Object.keys(events).length) htmxTrigger(res, events);
    return res.status(204).end();
  }
  if (flash) req.session.flash = flash;
  return res.redirect(redirect);
}

export function renderFormOrPage(req, res, { page, partial, data }) {
  if (isHtmx(req)) return res.render(partial, data);
  return res.render(page, { ...data, autoOpenModal: partial });
}
