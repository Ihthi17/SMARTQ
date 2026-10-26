import mongoose from 'mongoose';

const noShowPredictionModelSchema = new mongoose.Schema(
  {
    version: { type: String, default: 'current', index: true },
    modelType: { type: String, default: 'logistic_regression' },
    accuracy: { type: Number, min: 0, max: 1 },
    samplesUsed: { type: Number, min: 0 },
    trainedAt: { type: Date, default: Date.now },
    coefficients: [{ type: Number }],
    intercept: { type: Number },
    featureNames: [{ type: String }],
    metrics: {
      precision: { type: Number, min: 0, max: 1 },
      recall: { type: Number, min: 0, max: 1 },
      f1Score: { type: Number, min: 0, max: 1 },
    },
  },
  { collection: 'noShowPredictionModels', timestamps: true },
);

export const NoShowPredictionModel = mongoose.model('NoShowPredictionModel', noShowPredictionModelSchema);
