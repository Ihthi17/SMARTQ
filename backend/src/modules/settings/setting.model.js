import mongoose from 'mongoose';

// One document per key — singleton pattern via upsert.
// Sensitive values (SMTP password) are excluded from default queries.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    label: { type: String, trim: true },
    group: { type: String, trim: true, index: true },   // e.g. 'smtp', 'general', 'security'
    isSecret: { type: Boolean, default: false },         // hide value in GET responses
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'settings', timestamps: true },
);

settingSchema.statics.get = async function (key, fallback = null) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : fallback;
};

settingSchema.statics.set = async function (key, value, meta = {}) {
  return this.findOneAndUpdate(
    { key },
    { $set: { value, ...meta } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

settingSchema.statics.getGroup = async function (group) {
  const docs = await this.find({ group });
  return Object.fromEntries(docs.map((d) => [d.key, d.isSecret ? '••••' : d.value]));
};

export const Setting = mongoose.model('Setting', settingSchema);
