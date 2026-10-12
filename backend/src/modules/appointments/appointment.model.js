import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', index: true },
    branchCode: { type: String, trim: true, uppercase: true, index: true },
    serviceCode: { type: String, trim: true, uppercase: true },
    customerName: { type: String, trim: true, maxlength: 150 },
    customerEmail: { type: String, trim: true, lowercase: true },
    customerPhone: { type: String, trim: true },
    qrTokenHash: { type: String, select: false },
    qrGeneratedAt: { type: Date }, // When QR was generated (on confirmation)
    qrExpiresAt: { type: Date }, // QR expires 1 minute after generation
    queueDate: { type: Date, required: true, index: true },
    scheduledStart: { type: Date, required: true },
    // False for walk-in / flexible services where the customer did not pick a date/time.
    // scheduledStart still holds a placeholder for queue ordering, but the UI shows "—".
    hasScheduledTime: { type: Boolean, default: true },
    scheduledEnd: Date,
    startTime: { type: Date }, // When admin confirms appointment
    checkInOpensAt: { type: Date }, // startTime - 30 min (configurable)
    checkInExpiresAt: { type: Date }, // startTime + 15 min (configurable)
    tokenNumber: { type: Number, min: 1, default: null, sparse: true }, // null until admin confirms
    tokenLabel: { type: String, trim: true, default: null, sparse: true }, // null until admin confirms
    bookingType: { type: String, enum: ['in_person', 'virtual'], default: 'in_person' },
    createdVia: { type: String, enum: ['online', 'admin'], default: 'online' },
    priority: { type: String, enum: ['normal', 'high', 'emergency'], default: 'normal' },
    priorityScore: { type: Number, default: 100, index: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'queued', 'called', 'in_service', 'completed', 'cancelled', 'expired', 'no_show'],
      default: 'pending',
      index: true,
    },
    checkInMethod: { type: String, enum: ['qr_admin', 'manual'] },
    checkedInAt: Date,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    queueNumber: { type: Number, min: 1 },
    queueJoinedAt: Date,
    calledAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancelReason: { type: String, trim: true, maxlength: 500 },
    estimatedWaitMinutes: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 2000 },
    intakeData: { type: mongoose.Schema.Types.Mixed, default: {} },
    cancellationReason: { type: String, trim: true, maxlength: 500 },

    // Recurring Appointment Fields
    recurringSeriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringSeries', index: true, sparse: true },
    isRecurringParent: { type: Boolean, default: false }, // True if this is the first appointment in a recurring series
    recurringSequenceNumber: { type: Number, min: 0, default: 0 }, // 0 for non-recurring, 1+ for recurring instances

    // Waiting List Fields
    waitingListPosition: { type: Number, min: 1, sparse: true }, // Position in waiting list if appointment is in waiting list
    waitingListExpiresAt: { type: Date, sparse: true }, // When waiting list entry expires
    waitingListNotifiedAt: { type: Date, sparse: true }, // When customer was notified of slot availability

    // Queue Recall/Remind Fields
    callStatus: { type: String, enum: ['not_called', 'called', 'recalled', 'no_response'], default: 'not_called' },
    calledAt: Date, // When customer was called for the first time
    recallCount: { type: Number, min: 0, default: 0 }, // Number of times customer was recalled
    lastRecalledAt: Date, // When customer was last recalled
    nextAutoRecallAt: Date, // When to auto-recall if no response
    recallAttempts: [{ // History of recall attempts
      attemptNumber: Number,
      recalledAt: Date,
      method: { type: String, enum: ['sms', 'email', 'whatsapp', 'call'], default: 'sms' },
      status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    }],

    // Counter Assignment Fields (for specific_counter calling method)
    assignedCounterNumber: { type: String, trim: true, sparse: true }, // Counter assigned to this appointment
    assignedCounterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CounterAssignment', sparse: true }, // Reference to counter assignment
  },
  { collection: 'appointments', timestamps: true },
);

// Uniqueness only applies to real token numbers (allocated on confirmation, always >= 1).
// Multiple pending appointments with tokenNumber null on the same provider/date are allowed.
// NOTE: MongoDB partial indexes do NOT support $ne/$not, so we filter on `tokenNumber > 0`.
appointmentSchema.index(
  { providerId: 1, queueDate: 1, tokenNumber: 1 },
  { unique: true, partialFilterExpression: { tokenNumber: { $gt: 0 } } },
);
appointmentSchema.index({ providerId: 1, queueDate: 1, status: 1, priorityScore: 1, createdAt: 1 });
appointmentSchema.index({ status: 1, checkInExpiresAt: 1 }); // For cron job to find expired/no-show

export const Appointment = mongoose.model('Appointment', appointmentSchema);
