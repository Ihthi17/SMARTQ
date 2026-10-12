import { RecurringSeries } from './recurring-series.model.js';
import { Appointment } from './appointment.model.js';
import { createAppointment, dayStart } from './token.service.js';
import { Setting } from '../settings/setting.model.js';

/**
 * Create a new recurring appointment series
 */
export const createRecurringSeries = async ({
  userId, providerId, branchCode, serviceCode,
  customerName, customerEmail, customerPhone,
  recurrenceType, startDate, endDate, maxOccurrences,
  daysOfWeek, dayOfMonth, timeOfDay,
  bookingType = 'in_person', priority = 'normal', notes, intakeData = {},
}) => {
  // Validate recurrence parameters
  if (!['daily', 'weekly', 'biweekly', 'monthly'].includes(recurrenceType)) {
    throw new Error('Invalid recurrence type. Must be: daily, weekly, biweekly, or monthly.');
  }

  if (recurrenceType === 'weekly' && (!daysOfWeek || !daysOfWeek.length)) {
    throw new Error('Days of week are required for weekly recurrence.');
  }

  if (recurrenceType === 'monthly' && !dayOfMonth) {
    throw new Error('Day of month is required for monthly recurrence.');
  }

  const now = new Date();
  const start = new Date(startDate);
  if (start < now) {
    throw new Error('Start date must be in the future.');
  }

  if (endDate && new Date(endDate) <= start) {
    throw new Error('End date must be after start date.');
  }

  if (maxOccurrences && maxOccurrences < 1) {
    throw new Error('Maximum occurrences must be at least 1.');
  }

  // Create recurring series record
  const series = await RecurringSeries.create({
    userId,
    providerId,
    branchCode: String(branchCode).toUpperCase(),
    serviceCode: String(serviceCode).toUpperCase(),
    customerName,
    customerEmail,
    customerPhone,
    recurrenceType,
    startDate: start,
    endDate: endDate ? new Date(endDate) : null,
    maxOccurrences,
    daysOfWeek: daysOfWeek || [],
    dayOfMonth,
    timeOfDay,
    bookingType,
    priority,
    notes,
    intakeData,
    status: 'active',
    totalOccurrences: 0,
    nextOccurrenceDate: start,
  });

  // Create first appointment immediately
  await createRecurringAppointment(series._id);

  return series;
};

/**
 * Create next appointment in recurring series
 */
export const createRecurringAppointment = async (seriesId) => {
  const series = await RecurringSeries.findById(seriesId);
  if (!series) throw new Error('Recurring series not found.');
  if (series.status !== 'active') throw new Error('This recurring series is not active.');

  // Check if max occurrences reached
  if (series.maxOccurrences && series.totalOccurrences >= series.maxOccurrences) {
    series.status = 'completed';
    await series.save();
    throw new Error('Maximum occurrences for this series reached.');
  }

  // Check if end date passed
  if (series.endDate && new Date(series.nextOccurrenceDate) > series.endDate) {
    series.status = 'completed';
    await series.save();
    throw new Error('End date for this recurring series has passed.');
  }

  // Calculate appointment time
  const appointmentDate = new Date(series.nextOccurrenceDate);
  if (series.timeOfDay) {
    const [hours, minutes] = series.timeOfDay.split(':');
    appointmentDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  }

  try {
    // Create appointment
    const { appointment } = await createAppointment({
      userId: series.userId,
      providerId: series.providerId,
      branchCode: series.branchCode,
      serviceCode: series.serviceCode,
      customerName: series.customerName,
      customerEmail: series.customerEmail,
      customerPhone: series.customerPhone,
      scheduledStart: appointmentDate,
      bookingType: series.bookingType,
      priority: series.priority,
      notes: series.notes,
      intakeData: series.intakeData,
      createdVia: 'admin',
    });

    // Link appointment to series
    appointment.recurringSeriesId = seriesId;
    appointment.recurringSequenceNumber = series.totalOccurrences + 1;
    if (series.totalOccurrences === 0) {
      appointment.isRecurringParent = true;
    }
    await appointment.save();

    // Update series
    series.totalOccurrences += 1;
    series.lastOccurrenceDate = appointmentDate;

    // Calculate next occurrence
    const nextDate = calculateNextOccurrence(
      appointmentDate,
      series.recurrenceType,
      series.daysOfWeek,
      series.dayOfMonth,
    );
    series.nextOccurrenceDate = nextDate;

    await series.save();

    return appointment;
  } catch (error) {
    console.error(`Failed to create recurring appointment for series ${seriesId}:`, error);
    throw error;
  }
};

/**
 * Calculate next occurrence date based on recurrence pattern
 */
export const calculateNextOccurrence = (currentDate, recurrenceType, daysOfWeek = [], dayOfMonth) => {
  const next = new Date(currentDate);

  if (recurrenceType === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (recurrenceType === 'weekly') {
    // Find next occurrence on specified day(s) of week
    if (!daysOfWeek.length) throw new Error('Days of week required for weekly recurrence.');

    let found = false;
    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() + i);
      if (daysOfWeek.includes(checkDate.getDay())) {
        next.setTime(checkDate.getTime());
        found = true;
        break;
      }
    }
    if (!found) {
      next.setDate(next.getDate() + 7);
    }
  } else if (recurrenceType === 'biweekly') {
    next.setDate(next.getDate() + 14);
  } else if (recurrenceType === 'monthly') {
    if (!dayOfMonth) throw new Error('Day of month required for monthly recurrence.');

    next.setMonth(next.getMonth() + 1);
    next.setDate(dayOfMonth);

    // Handle case where dayOfMonth doesn't exist in next month (e.g., Feb 31)
    if (next.getDate() !== dayOfMonth) {
      next.setDate(0); // Go to last day of previous month
    }
  }

  return next;
};

/**
 * Pause a recurring series
 */
export const pauseRecurringSeries = async (seriesId) => {
  const series = await RecurringSeries.findByIdAndUpdate(
    seriesId,
    { status: 'paused' },
    { new: true },
  );
  if (!series) throw new Error('Recurring series not found.');
  return series;
};

/**
 * Resume a paused recurring series
 */
export const resumeRecurringSeries = async (seriesId) => {
  const series = await RecurringSeries.findByIdAndUpdate(
    seriesId,
    { status: 'active' },
    { new: true },
  );
  if (!series) throw new Error('Recurring series not found.');
  return series;
};

/**
 * Cancel a recurring series and optionally cancel future appointments
 */
export const cancelRecurringSeries = async (seriesId, cancelFutureAppointments = true, reason = '') => {
  const series = await RecurringSeries.findByIdAndUpdate(
    seriesId,
    {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: reason,
    },
    { new: true },
  );
  if (!series) throw new Error('Recurring series not found.');

  if (cancelFutureAppointments) {
    // Cancel all future pending/confirmed appointments in this series
    await Appointment.updateMany(
      {
        recurringSeriesId: seriesId,
        status: { $in: ['pending', 'confirmed', 'queued', 'called'] },
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: `Series cancelled: ${reason}`,
        },
      },
    );
  }

  return series;
};

/**
 * Get all recurring series for a user
 */
export const getUserRecurringSeries = async (userId, options = {}) => {
  const {
    status = 'active', // 'active', 'paused', 'cancelled', or 'all'
    page = 1,
    limit = 10,
  } = options;

  const query = { userId };
  if (status !== 'all') {
    query.status = status;
  }

  const skip = (page - 1) * limit;
  const series = await RecurringSeries.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await RecurringSeries.countDocuments(query);

  return { series, total, page, limit, pages: Math.ceil(total / limit) };
};

/**
 * Scheduler job to create next recurring appointments
 * Should be run periodically (e.g., daily)
 */
export const processRecurringSeries = async () => {
  const now = new Date();

  // Find active series where next occurrence is today or earlier
  const series = await RecurringSeries.find({
    status: 'active',
    nextOccurrenceDate: { $lte: now },
  });

  for (const seriesRecord of series) {
    try {
      await createRecurringAppointment(seriesRecord._id);
    } catch (error) {
      console.error(`Failed to process recurring series ${seriesRecord._id}:`, error.message);
    }
  }

  return series.length;
};
