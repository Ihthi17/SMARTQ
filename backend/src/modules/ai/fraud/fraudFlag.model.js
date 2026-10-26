import mongoose from 'mongoose';

const fraudFlagSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    fraudScore: { type: Number, min: 0, max: 100, required: true },
    riskFactors: [{ type: String }],
    flagReason: { type: String, maxlength: 1000 },
    requiresVerification: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending_verification', 'flagged', 'verified', 'rejected', 'dismissed'],
      default: 'flagged',
      index: true,
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    notes: { type: String, maxlength: 500 },
  },
  { collection: 'fraudFlags', timestamps: true },
);

fraudFlagSchema.index({ status: 1, createdAt: -1 });

export const FraudFlag = mongoose.model('FraudFlag', fraudFlagSchema);
