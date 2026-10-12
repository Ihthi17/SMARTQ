import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, match: /^[A-Z0-9][A-Z0-9_-]{0,59}$/ },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    placeId: { type: String, trim: true }, // Google Places ID
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    radiusMeters: { type: Number, default: 200, min: 10, max: 10000 }, // For future use
    isActive: { type: Boolean, default: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', index: true }, // Link to provider if needed
  },
  { collection: 'locations', timestamps: true },
);

// Index for active locations
locationSchema.index({ isActive: 1, createdAt: -1 });

export const Location = mongoose.model('Location', locationSchema);
