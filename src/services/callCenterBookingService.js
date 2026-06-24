import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { sendNotification } from '../utils/audit.js';
import { onAppointmentBooked, createLeadFollowUp } from './workflowOrchestrationService.js';
import { addDays, startOfDay, endOfDay } from 'date-fns';

export async function lookupCustomerByPhone(phone, branchFilter = {}) {
  const normalized = String(phone).replace(/\D/g, '').slice(-10);
  if (normalized.length < 10) return null;
  return prisma.customer.findFirst({
    where: {
      OR: [{ phone: { contains: normalized } }, { alternatePhone: { contains: normalized } }],
      ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
    },
    include: { branch: true },
  });
}

export async function getAvailableSlots({ branchId, date, consultantId }) {
  const day = date ? new Date(date) : new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      branchId,
      ...(consultantId ? { consultantId } : {}),
      scheduledAt: { gte: startOfDay(day), lte: endOfDay(day) },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    select: { scheduledAt: true, duration: true },
  });

  const slots = [];
  for (let hour = 9; hour < 19; hour++) {
    for (const minute of [0, 30]) {
      const slot = new Date(day);
      slot.setHours(hour, minute, 0, 0);
      if (slot < new Date()) continue;
      const conflict = appointments.some((a) => {
        const start = new Date(a.scheduledAt).getTime();
        const end = start + (a.duration || 30) * 60000;
        const t = slot.getTime();
        return t >= start && t < end;
      });
      if (!conflict) {
        slots.push({ time: slot.toISOString(), label: slot.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
      }
    }
  }
  return slots.slice(0, 16);
}

export async function bookDialerAppointment({
  customerPhone,
  customerName,
  email,
  branchId,
  branchCode,
  consultantId,
  scheduledAt,
  category,
  leadSource,
  campaign,
  bookedById,
  createFollowUp = false,
}) {
  let branch = branchId
    ? await prisma.branch.findUnique({ where: { id: branchId } })
    : await prisma.branch.findUnique({ where: { code: branchCode } });
  if (!branch) throw new Error('Branch not found');

  let customer = await lookupCustomerByPhone(customerPhone);
  if (!customer) {
    const uhid = await generateNumber('UHID', 'customer', 'uhid');
    const [firstName, ...rest] = (customerName || 'Walk-in Customer').split(' ');
    customer = await prisma.customer.create({
      data: {
        uhid,
        firstName,
        lastName: rest.join(' ') || '.',
        phone: customerPhone,
        email: email || null,
        branchId: branch.id,
        category: category || 'HAIR',
        leadSource: leadSource || 'CALL_CENTER',
      },
      include: { branch: true },
    });
    if (createFollowUp) await createLeadFollowUp(customer.id, 'NOT_JOINED');
  }

  const appointmentNo = await generateNumber('APT', 'appointment', 'appointmentNo');
  const appointment = await prisma.appointment.create({
    data: {
      appointmentNo,
      customerId: customer.id,
      consultantId: consultantId || null,
      branchId: branch.id,
      category: category || customer.category,
      scheduledAt: new Date(scheduledAt),
      type: 'CONSULTATION',
      status: 'CONFIRMED',
      source: 'CALL_CENTER',
      leadSource: leadSource || 'DIALER',
      campaign,
    },
    include: { customer: true },
  });

  await onAppointmentBooked({
    appointment,
    customer,
    bookedById,
    source: 'CALL_CENTER',
  });

  if (customer.phone) {
    await sendNotification({
      type: 'SMS',
      recipient: customer.phone,
      message: `VCare: Appointment ${appointmentNo} confirmed for ${new Date(scheduledAt).toLocaleString('en-IN')}.`,
      module: 'DIALER',
      entityId: appointment.id,
    });
  }

  return { appointment, customer };
}

export async function getDialerDashboard(branchFilter = {}) {
  const today = new Date();
  const [todayAppts, pendingFu, recentLeads] = await Promise.all([
    prisma.appointment.count({
      where: {
        ...branchFilter,
        scheduledAt: { gte: startOfDay(today), lte: endOfDay(today) },
        source: 'CALL_CENTER',
      },
    }),
    prisma.followUp.count({
      where: {
        status: 'PENDING',
        ...(branchFilter.branchId ? { customer: { branchId: branchFilter.branchId } } : {}),
      },
    }),
    prisma.customer.findMany({
      where: {
        ...branchFilter,
        leadSource: { in: ['CALL_CENTER', 'DIALER', 'ONLINE'] },
        createdAt: { gte: addDays(today, -7) },
      },
      orderBy: { registeredAt: 'desc' },
      take: 10,
      include: { branch: true },
    }),
  ]);

  return { todayAppts, pendingFu, recentLeads };
}
