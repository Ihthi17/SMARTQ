import mongoose from 'mongoose';

const waitTimeHistorySchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    queueDate: { type: Date, required: true },
    timeOfDay: { type: String, enum: ['morning', 'afternoon', 'evening'] },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    queueSize: { type: Number, min: 0 },
    serviceCode: { type: String, trim: true, uppercase: true },
    predictedWaitMinutes: { type: Number, min: 0 },
    actualWaitMinutes: { type: Number, min: 0, sparse: true },
    actualServiceMinutes: { type: Number, min: 0, sparse: true },
    features_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: 'waitTimeHistory', timestamps: true },
);

waitTimeHistorySchema.index({ providerId: 1, queueDate: -1 });

export const WaitTimeHistory = mongoose.model('WaitTimeHistory', waitTimeHistorySchema);
