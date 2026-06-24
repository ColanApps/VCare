import { prisma } from '../lib/prisma.js';
import { dispatchNotification } from '../services/notificationService.js';

export async function logAudit({ userId, action, module, entityType, entityId, details, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        module,
        entityType,
        entityId,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

export async function sendNotification({ type, recipient, subject, message, module, entityId }) {
  return dispatchNotification({ type, recipient, subject, message, module, entityId });
}
