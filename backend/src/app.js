import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import authRoutes     from './modules/auth/auth.routes.js';
import userRoutes     from './modules/users/user.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import appointmentRoutes from './modules/appointments/appointment.routes.js';
import queueRoutes from './modules/queue/queue.routes.js';
import providerRoutes from './modules/providers/provider.routes.js';
import serviceRoutes from './modules/providers/service.routes.js';
import locationRoutes from './modules/locations/location.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import predictionRoutes from './modules/ai/prediction/prediction.routes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({
  limit: '6mb',
  type: (request) => {
    // Don't parse as JSON if it's multipart/form-data
    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) return false;
    
    // Exclude backup restore endpoint
    if (request.path === '/api/settings/backup/restore') return false;
    
    // For appointments, exclude paths with file uploads
    if (request.path.startsWith('/api/appointments/')) {
      if (request.path.includes('/upload') || request.path.includes('/requirements')) return false;
      return true;
    }
    return true;
  },
}));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'smart-queue-api' }));

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/predictions', predictionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
