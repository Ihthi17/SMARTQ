import mongoose from 'mongoose';

const queueSessionSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    queueDate: { type: Date, required: true },
    branchCode: { type: String, trim: true, uppercase: true, index: true },
    status: { type: String, enum: ['open', 'paused', 'closed'], default: 'open', index: true },
    currentToken: { type: Number, min: 1 },
    lastCalledToken: { type: Number, min: 1 },
    servedCount: { type: Number, min: 0, default: 0 },
    skippedCount: { type: Number, min: 0, default: 0 },
    queueLength: { type: Number, min: 0, default: 0 },
    averageServiceMinutes: { type: Number, min: 1, default: 15 },
    redisKey: { type: String, trim: true },
    openedAt: { type: Date, default: Date.now },
    closedAt: Date,
  },
  { collection: 'queueSessions', timestamps: true },
);

queueSessionSchema.index({ providerId: 1, queueDate: 1 }, { unique: true });

export const QueueSession = mongoose.model('QueueSession', queueSessionSchema);
