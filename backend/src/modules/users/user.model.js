import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

const userSchema = new mongoose.Schema(
  {
    // --- identity ---
    name: { type: String, trim: true, maxlength: 100 },
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    password: { type: String, required: true, minlength: 8, select: false },
    phone: { type: String, trim: true, unique: true, sparse: true },

    // --- access control ---
    role: {
      type: String,
      validate: {
        validator: (role) => ['SUPER_ADMIN', 'admin', 'staff'].includes(role) || /^custom_[a-z0-9_]+$/.test(role),
        message: 'Role must be a predefined role or an active custom role.',
      },
      default: 'staff',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },

    // --- auth helpers ---
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: Date,
    refreshTokenHash: { type: String, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    lastLoginAt: Date,

    // --- profile ---
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      appointmentReminders: { type: Boolean, default: true },
      queueUpdates: { type: Boolean, default: true },
    },
  },
  { collection: 'users', timestamps: true },
);

// --- indexes ---
userSchema.index({ role: 1, status: 1 });

// --- password hashing ---
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// --- instance helpers ---
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.setRefreshTokenHash = async function (token) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.refreshTokenHash = await bcrypt.hash(token, salt);
  await this.save();
};

userSchema.methods.clearRefreshToken = async function () {
  this.refreshTokenHash = null;
  await this.save();
};

// strip sensitive fields from JSON output
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshTokenHash;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
export default User;
