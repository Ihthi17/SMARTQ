import { Appointment } from './appointment.model.js';
import { Setting } from '../settings/setting.model.js';

const activeAppointmentStatuses = { $nin: ['cancelled', 'no_show'] };

export const enforceDailyAppointmentLimit = async ({ queueDate, excludeAppointmentId }) => {
  const maximum = Number(await Setting.get('appointment_max_daily', 100));
  if (!Number.isFinite(maximum) || maximum <= 0) return;

  const count = await Appointment.countDocuments({
    queueDate,
    status: activeAppointmentStatuses,
    ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
  });
  if (count >= maximum) {
    throw Object.assign(new Error('No appointments are available for this date.'), { statusCode: 409 });
  }
};

export const enforceCustomerAppointmentLimit = async ({ queueDate, customerEmail, customerPhone, excludeAppointmentId }) => {
  const maximum = Number(await Setting.get('appointment_max_per_customer', 50));
  if (!Number.isFinite(maximum) || maximum <= 0) return;

  const customerIdentity = [
    customerEmail && { customerEmail: customerEmail.trim().toLowerCase() },
    customerPhone && { customerPhone: customerPhone.trim() },
  ].filter(Boolean);
  const count = await Appointment.countDocuments({
    queueDate,
    $or: customerIdentity,
    status: activeAppointmentStatuses,
    ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
  });
  if (count >= maximum) {
    throw Object.assign(new Error('You have reached the appointment limit for this date.'), { statusCode: 409 });
  }
};
