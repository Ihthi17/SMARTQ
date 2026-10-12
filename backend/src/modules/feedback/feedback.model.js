import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 2000 },
    sentimentScore: Number,
    sentimentLabel: { type: String, enum: ['positive', 'neutral', 'negative'] },
    flaggedAsComplaint: { type: Boolean, default: false, index: true },
    complaintCategories: [{ type: String, trim: true }],
    isAnonymous: { type: Boolean, default: false },
  },
  { collection: 'feedback', timestamps: true },
);

feedbackSchema.index({ providerId: 1, createdAt: -1 });
feedbackSchema.index({ userId: 1, appointmentId: 1 });

export const Feedback = mongoose.model('Feedback', feedbackSchema);
