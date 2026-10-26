import { Provider } from './provider.model.js';
import { Service } from './service.model.js';
import { Location } from '../locations/location.model.js';

export const seedProvidersAndServices = async () => {
  try {
    console.log('[SEED] Service seeding is disabled. Super Admin can create services manually via admin UI.');
    // Seeding disabled - Super Admin creates services through admin interface
  } catch (err) {
    console.error('[SEED ERROR] Failed to seed providers:', err.message);
    throw err;
  }
};
