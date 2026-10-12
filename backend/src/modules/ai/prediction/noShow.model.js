import mongoose from 'mongoose';

const noShowHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    scheduledStart: { type: Date, required: true },
    bookingLeadHours: { type: Number, min: 0 },
    reminderSent: { type: Boolean, default: false },
    previousNoShows: { type: Number, min: 0, default: 0 },
    previousCompleted: { type: Number, min: 0, default: 0 },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    hourOfDay: { type: Number, min: 0, max: 23 },
    bookingType: { type: String, enum: ['in_person', 'virtual'] },
    priority: { type: String, enum: ['normal', 'high', 'emergency'] },
    outcome: { type: String, enum: ['attended', 'no_show', 'cancelled'], required: true, index: true },
    predictedProbability: { type: Number, min: 0, max: 1 },
    featureSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: 'noShowHistory', timestamps: true },
);

noShowHistorySchema.index({ providerId: 1, outcome: 1, scheduledStart: -1 });

export const NoShowHistory = mongoose.model('NoShowHistory', noShowHistorySchema);
