import mongoose from 'mongoose';

const waitTimePredictionModelSchema = new mongoose.Schema(
  {
    version: { type: String, default: 'current', index: true },
    modelType: { type: String, default: 'polynomial_regression' },
    degree: { type: Number, default: 2 },
    mae: { type: Number, min: 0 }, // Mean Absolute Error
    samplesUsed: { type: Number, min: 0 },
    trainedAt: { type: Date, default: Date.now },
    coefficients: [{ type: Number }],
    featureNames: [{ type: String }],
  },
  { collection: 'waitTimePredictionModels', timestamps: true },
);

export const WaitTimePredictionModel = mongoose.model('WaitTimePredictionModel', waitTimePredictionModelSchema);
