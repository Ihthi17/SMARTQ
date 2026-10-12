import mongoose from 'mongoose';

const requirementSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, match: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/ },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  type: { type: String, enum: ['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox', 'file'], default: 'text' },
  required: { type: Boolean, default: false },
  options: [{ type: String, trim: true, maxlength: 100 }],
}, { _id: false });

const serviceSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true, unique: true, match: /^[A-Z0-9][A-Z0-9_-]{1,39}$/ },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', index: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  channels: { type: [{ type: String, enum: ['appointments', 'queue'] }], default: ['appointments', 'queue'] },
  durationMinutes: { type: Number, min: 1, max: 1440, default: 15 },
  requiresDateTime: { type: Boolean, default: true },
  requirements: { type: [requirementSchema], default: [] },
  isActive: { type: Boolean, default: true },
}, { collection: 'services', timestamps: true });

export const Service = mongoose.models.Service || mongoose.model('Service', serviceSchema);
