import { prisma } from '../lib/prisma.js';

export async function sendEmail({ to, subject, message }) {
  const config = await prisma.emailConfig.findFirst({ where: { isActive: true } });

  if (!config) {
    await logNotification('EMAIL', to, subject, message, 'QUEUED');
    return { sent: false, mode: 'logged' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.username, pass: config.password },
    });

    await transporter.sendMail({
      from: config.fromEmail,
      to,
      subject,
      text: message,
      html: `<div style="font-family:sans-serif;line-height:1.6">${message.replace(/\n/g, '<br>')}</div>`,
    });

    await logNotification('EMAIL', to, subject, message, 'SENT');
    return { sent: true, mode: 'smtp' };
  } catch (err) {
    console.error('Email send failed:', err.message);
    await logNotification('EMAIL', to, subject, message, 'FAILED');
    return { sent: false, mode: 'failed', error: err.message };
  }
}

export async function sendSms({ to, message }) {
  const config = await prisma.smsConfig.findFirst({ where: { isActive: true } });

  if (!config) {
    await logNotification('SMS', to, null, message, 'QUEUED');
    return { sent: false, mode: 'logged' };
  }

  try {
    const url = `https://api.textlocal.in/send/?apikey=${encodeURIComponent(config.apiKey)}&numbers=${encodeURIComponent(to)}&sender=${encodeURIComponent(config.senderId)}&message=${encodeURIComponent(message)}`;
    const response = await fetch(url);
    const ok = response.ok;

    await logNotification('SMS', to, null, message, ok ? 'SENT' : 'FAILED');
    return { sent: ok, mode: config.provider };
  } catch (err) {
    console.error('SMS send failed:', err.message);
    await logNotification('SMS', to, null, message, 'FAILED');
    return { sent: false, mode: 'failed', error: err.message };
  }
}

export async function dispatchNotification({ type, recipient, subject, message, module, entityId }) {
  if (type === 'EMAIL') {
    return sendEmail({ to: recipient, subject, message });
  }
  if (type === 'SMS') {
    return sendSms({ to: recipient, message });
  }
  await logNotification(type, recipient, subject, message, 'QUEUED', module, entityId);
  return { sent: false, mode: 'unknown' };
}

async function logNotification(type, recipient, subject, message, status, module, entityId) {
  await prisma.notificationLog.create({
    data: { type, recipient, subject, message, status, module, entityId },
  });
}
