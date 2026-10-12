import mongoose from 'mongoose';

// Import all models so Mongoose registers them and builds indexes on first use.
import '../modules/ai/fraud/fraudFlag.model.js';
import '../modules/ai/prediction/noShow.model.js';
import '../modules/appointments/appointment.model.js';
import '../modules/feedback/feedback.model.js';
import '../modules/notifications/notification.model.js';
import '../modules/providers/provider.model.js';
import '../modules/providers/service.model.js';
import '../modules/queue/queueSession.model.js';
import '../modules/settings/setting.model.js';
import '../modules/users/user.model.js';

export const connectDatabase = async () => {
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) throw new Error('MONGODB_URI must be configured.');

  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected — collections and indexes ready');
};
