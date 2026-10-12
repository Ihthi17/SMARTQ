import mongoose from 'mongoose';

const counterAssignmentSchema = new mongoose.Schema(
  {
    // --- assignment info ---
    staffId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Provider', index: true },
    counterNumber: { type: String, required: true, trim: true },
    counterLabel: { type: String, trim: true },

    // --- timing ---
    assignedAt: { type: Date, required: true, default: Date.now },
    unassignedAt: Date,
    status: {
      type: String,
      enum: ['assigned', 'serving', 'on_break', 'unassigned'],
      default: 'assigned',
      index: true,
    },

    // --- current service ---
    currentAppointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    currentServiceStartedAt: Date,
    servicesCompletedToday: { type: Number, default: 0 },

    // --- queue date ---
    queueDate: {
      type: Date,
      required: true,
      get: (date) => (date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) : null),
      set: (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
      index: true,
    },

    // --- metadata ---
    notes: { type: String, maxlength: 500 },
  },
  { collection: 'counterAssignments', timestamps: true },
);

// Indexes
counterAssignmentSchema.index({ providerId: 1, queueDate: 1, status: 1 });
counterAssignmentSchema.index({ staffId: 1, queueDate: 1 });
counterAssignmentSchema.index({ providerId: 1, counterNumber: 1, queueDate: 1 }, { unique: true });

// Methods
counterAssignmentSchema.methods.startServing = function(appointmentId) {
  this.status = 'serving';
  this.currentAppointmentId = appointmentId;
  this.currentServiceStartedAt = new Date();
  return this.save();
};

counterAssignmentSchema.methods.completeService = function() {
  this.status = 'assigned';
  this.currentAppointmentId = null;
  this.currentServiceStartedAt = null;
  this.servicesCompletedToday += 1;
  return this.save();
};

counterAssignmentSchema.methods.takeBreak = function() {
  this.status = 'on_break';
  return this.save();
};

counterAssignmentSchema.methods.resumeServing = function() {
  this.status = 'assigned';
  return this.save();
};

counterAssignmentSchema.methods.unassign = function() {
  this.status = 'unassigned';
  this.unassignedAt = new Date();
  this.currentAppointmentId = null;
  return this.save();
};

export const CounterAssignment = mongoose.model('CounterAssignment', counterAssignmentSchema);
