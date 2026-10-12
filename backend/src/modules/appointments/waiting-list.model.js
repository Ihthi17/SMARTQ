import mongoose from 'mongoose';

const waitingListSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    branchCode: { type: String, trim: true, uppercase: true, required: true, index: true },
    serviceCode: { type: String, trim: true, uppercase: true, required: true },
    queueDate: { type: Date, required: true, index: true },

    customerName: { type: String, trim: true, required: true },
    customerEmail: { type: String, trim: true, lowercase: true, required: true },
    customerPhone: { type: String, trim: true, required: true },

    // Waiting List Position and Status
    position: { type: Number, min: 1, required: true, index: true }, // Order in waiting list (1=first)
    status: { type: String, enum: ['waiting', 'notified', 'confirmed', 'expired', 'cancelled'], default: 'waiting' },

    // Slot Availability
    slotBecameAvailableAt: Date, // When the slot opened up for this waiting list entry
    notificationSentAt: Date, // When customer was notified of availability
    notificationChannel: { type: String, enum: ['sms', 'email', 'whatsapp'] }, // How notification was sent
    confirmationDeadline: Date, // Customer must confirm by this time
    confirmedAt: Date, // When customer confirmed they want the slot

    // Expiration
    expiresAt: { type: Date, required: true, index: true }, // When this waiting list entry expires
    reason: { type: String, max: 500 }, // Reason for cancellation/expiration

    priority: { type: String, enum: ['normal', 'high', 'emergency'], default: 'normal' },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  { collection: 'waiting_list', timestamps: true },
);

waitingListSchema.index({ providerId: 1, queueDate: 1, status: 1 });
waitingListSchema.index({ status: 1, expiresAt: 1 }); // For cleanup scheduler
waitingListSchema.index({ customerEmail: 1, status: 1 });

export const WaitingList = mongoose.model('WaitingList', waitingListSchema);
