import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', index: true },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'in_app'], required: true },
    category: { type: String, enum: ['booking_confirmation', 'appointment_reminder', 'queue_approaching', 'queue_called', 'cancellation', 'general'], required: true },
    recipient: { type: String, required: true, trim: true },
    subject: { type: String, trim: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: ['queued', 'sent', 'failed', 'mocked'], default: 'queued', index: true },
    scheduledFor: Date,
    sentAt: Date,
    providerMessageId: { type: String, trim: true },
    errorMessage: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: 'notificationLogs', timestamps: true },
);

notificationSchema.index({ status: 1, scheduledFor: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
