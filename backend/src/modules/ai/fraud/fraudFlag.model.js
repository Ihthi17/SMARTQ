import mongoose from 'mongoose';

const fraudFlagSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', index: true },
    type: { type: String, enum: ['duplicate_booking', 'rapid_booking', 'contact_reuse', 'repeated_cancellation', 'anomalous_pattern'], required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    evidence: [{ type: String, trim: true }],
    score: { type: Number, min: 0, max: 1 },
    status: { type: String, enum: ['open', 'reviewed', 'dismissed', 'confirmed'], default: 'open', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    resolutionNotes: { type: String, trim: true, maxlength: 1000 },
  },
  { collection: 'fraudFlags', timestamps: true },
);

fraudFlagSchema.index({ status: 1, severity: -1, createdAt: -1 });

export const FraudFlag = mongoose.model('FraudFlag', fraudFlagSchema);
