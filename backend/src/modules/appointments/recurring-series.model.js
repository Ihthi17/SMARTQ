import mongoose from 'mongoose';

const recurringSeriesSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    branchCode: { type: String, trim: true, uppercase: true, required: true, index: true },
    serviceCode: { type: String, trim: true, uppercase: true, required: true },
    customerName: { type: String, trim: true, required: true },
    customerEmail: { type: String, trim: true, lowercase: true, required: true },
    customerPhone: { type: String, trim: true, required: true },

    // Recurrence Pattern
    recurrenceType: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly'], required: true },
    startDate: { type: Date, required: true }, // First appointment date
    endDate: { type: Date }, // Last occurrence date (null = no end date)
    maxOccurrences: { type: Number, min: 1 }, // Max number of appointments to create (null = unlimited)
    daysOfWeek: [{ type: Number, min: 0, max: 6 }], // For weekly/biweekly: 0=Sunday, 1=Monday, etc.
    dayOfMonth: { type: Number, min: 1, max: 31 }, // For monthly recurrence
    timeOfDay: { type: String, match: /^\d{2}:\d{2}$/ }, // HH:MM format for scheduled time

    // Series Status
    status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
    totalOccurrences: { type: Number, min: 0, default: 1 }, // How many appointments created in this series
    nextOccurrenceDate: { type: Date }, // Next appointment to be created
    lastOccurrenceDate: { type: Date }, // Last appointment created date

    // Additional Info
    bookingType: { type: String, enum: ['in_person', 'virtual'], default: 'in_person' },
    priority: { type: String, enum: ['normal', 'high', 'emergency'], default: 'normal' },
    notes: { type: String, trim: true, maxlength: 2000 },
    intakeData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Cancellation
    cancelledAt: Date,
    cancellationReason: { type: String, trim: true, maxlength: 500 },
  },
  { collection: 'recurring_series', timestamps: true },
);

recurringSeriesSchema.index({ userId: 1, createdAt: -1 });
recurringSeriesSchema.index({ providerId: 1, status: 1 });
recurringSeriesSchema.index({ status: 1, nextOccurrenceDate: 1 }); // For scheduler

export const RecurringSeries = mongoose.model('RecurringSeries', recurringSeriesSchema);
