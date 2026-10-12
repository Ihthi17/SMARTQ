import mongoose from 'mongoose';

const workingHourSchema = new mongoose.Schema(
  {
    day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false },
);

const serviceFieldSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, match: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/ },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  type: { type: String, enum: ['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox'], default: 'text' },
  required: { type: Boolean, default: false },
  options: [{ type: String, trim: true, maxlength: 100 }],
}, { _id: false });

const serviceConfigurationSchema = new mongoose.Schema({
  serviceCode: { type: String, required: true, trim: true, uppercase: true },
  fields: { type: [serviceFieldSchema], default: [] },
}, { _id: false });

const providerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    type: { type: String, enum: ['provider', 'counter', 'branch'], default: 'provider' },
    services: [{ type: String, trim: true }],
    serviceConfigurations: { type: [serviceConfigurationSchema], default: [] },
    branch: {
      name: { type: String, trim: true },
      code: { type: String, trim: true, uppercase: true },
      address: { type: String, trim: true },
      coordinates: {
        latitude: { type: Number, min: -90, max: 90 },
        longitude: { type: Number, min: -180, max: 180 },
      },
    },
    staffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    workingHours: [workingHourSchema],
    avgServiceMinutes: { type: Number, min: 1, default: 15 },
    maxQueueSize: { type: Number, min: 1, default: 50 },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'providers', timestamps: true },
);

providerSchema.index({ 'branch.code': 1, isActive: 1 });

export const Provider = mongoose.model('Provider', providerSchema);
