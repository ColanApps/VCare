import { prisma } from '../lib/prisma.js';
import { generateNumber } from '../utils/helpers.js';
import { resolveBranchId } from '../utils/branchHelpers.js';
import { onAppointmentBooked } from './workflowOrchestrationService.js';
import { sendNotification } from '../utils/audit.js';

export async function createAppointment({
  customerId,
  bodyBranchId,
  userBranchId,
  consultantId,
  treatmentId,
  type,
  category,
  scheduledAt,
  duration,
  leadSource,
  campaign,
  notes,
  source,
  bookedById,
}) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error('Customer not found.');

  const branchId = resolveBranchId({
    bodyBranchId,
    userBranchId,
    customerBranchId: customer.branchId,
  });

  const appointmentNo = await generateNumber('APT', 'appointment', 'appointmentNo');
  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error('Enter a valid date and time.');
  }

  const appointment = await prisma.appointment.create({
    data: {
      appointmentNo,
      customerId,
      consultantId: consultantId || null,
      branchId,
      treatmentId: treatmentId || null,
      type: type || 'CONSULTATION',
      category: category || 'HAIR',
      scheduledAt: scheduledDate,
      duration: parseInt(duration, 10) || 30,
      status: 'SCHEDULED',
      leadSource: leadSource || null,
      campaign: campaign || null,
      notes: notes || null,
      source: source || 'WALK_IN',
    },
    include: { customer: true },
  });

  await onAppointmentBooked({
    appointment,
    customer: appointment.customer,
    bookedById,
    source: source || 'WALK_IN',
  });

  if (appointment.customer.email) {
    await sendNotification({
      type: 'EMAIL',
      recipient: appointment.customer.email,
      subject: `Appointment Confirmed - ${appointmentNo}`,
      message: `Your appointment is scheduled for ${scheduledDate.toLocaleString('en-IN')}.`,
      module: 'APPOINTMENTS',
      entityId: appointment.id,
    });
  }
  if (appointment.customer.phone) {
    await sendNotification({
      type: 'SMS',
      recipient: appointment.customer.phone,
      message: `VCare: Appointment ${appointmentNo} confirmed for ${scheduledDate.toLocaleDateString('en-IN')}.`,
      module: 'APPOINTMENTS',
      entityId: appointment.id,
    });
  }

  return { appointment, appointmentNo, scheduledDate };
}
