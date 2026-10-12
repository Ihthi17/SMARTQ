import mongoose from 'mongoose';

import { Appointment } from '../modules/appointments/appointment.model.js';
import { FraudFlag } from '../modules/ai/fraud/fraudFlag.model.js';
import { NoShowHistory } from '../modules/ai/prediction/noShow.model.js';
import { Feedback } from '../modules/feedback/feedback.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { Provider } from '../modules/providers/provider.model.js';
import { Service } from '../modules/providers/service.model.js';
import { QueueSession } from '../modules/queue/queueSession.model.js';
import { User } from '../modules/users/user.model.js';

const models = [User, Provider, Service, Appointment, QueueSession, Notification, Feedback, NoShowHistory, FraudFlag];

export const ensureCollections = async () => {
  const database = mongoose.connection.db;
  const existing = await database.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(existing.map(({ name }) => name));

  for (const model of models) {
    if (!names.has(model.collection.name)) {
      await database.createCollection(model.collection.name);
    }
    await model.init();
  }

  console.log('MongoDB collections and indexes are ready');
};
