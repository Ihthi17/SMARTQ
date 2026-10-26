import mongoose from 'mongoose';

const peakHourPredictionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true },
    hour: { type: Number, required: true, min: 0, max: 23 },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    predictedAppointments: { type: Number, min: 0 },
    expectedQueueSize: { type: Number, min: 0 },
    isPeakHour: { type: Boolean, default: false, index: true },
    confidence: { type: Number, min: 0, max: 1, default: 0.75 },
    basis: { type: String, enum: ['historical_pattern', 'ml_model'], default: 'historical_pattern' },
  },
  { collection: 'peakHourPredictions', timestamps: true },
);

peakHourPredictionSchema.index({ date: 1, hour: 1 }, { unique: true });

export const PeakHourPrediction = mongoose.model('PeakHourPrediction', peakHourPredictionSchema);
