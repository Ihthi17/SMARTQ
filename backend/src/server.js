import 'dotenv/config';

import app from './app.js';
import { connectDatabase } from './config/db.js';
import { configureSocket } from './config/socket.js';
import { seedSuperAdmin } from './utils/seedSuperAdmin.js';
import { seedSettings } from './modules/settings/settings.seed.js';
import { seedProvidersAndServices } from './modules/providers/providers.seed.js';
import { registerCronJobs } from './jobs/cronJobs.js';
import { startAutomaticBackupScheduler } from './modules/settings/backup.service.js';
import { startAuditRetentionScheduler } from './modules/settings/audit.service.js';
import { startNotificationScheduler } from './modules/notifications/notification.scheduler.js';

const port = Number(process.env.PORT || 5000);
const server = configureSocket(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other backend process or set a different PORT.`);
  } else {
    console.error('Smart Queue API server error:', error);
  }
  process.exit(1);
});

const startServer = async () => {
  await connectDatabase();
  await seedSuperAdmin();
  await seedSettings();
  await seedProvidersAndServices();
  registerCronJobs();
  startAutomaticBackupScheduler();
  startAuditRetentionScheduler();
  startNotificationScheduler();
  server.listen(port, () => {
    console.log(`Smart Queue API listening on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error('Unable to start Smart Queue API:', error);
  process.exit(1);
});
