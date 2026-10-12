import { Router } from 'express';
import { protect, authorizePermission } from '../../middlewares/auth.middleware.js';
import {
  createLocation,
  listLocations,
  getLocation,
  updateLocation,
  activateLocation,
  deactivateLocation,
  deleteLocation,
} from './location.controller.js';

const router = Router();

// Anyone can list active locations (for public use like service selection)
router.get('/', listLocations);

// Get single location (public)
router.get('/:id', getLocation);

// Admin-only routes
const adminOnly = [protect, authorizePermission('locations.manage')];

router.post('/', ...adminOnly, createLocation);
router.patch('/:id', ...adminOnly, updateLocation);
router.patch('/:id/activate', ...adminOnly, activateLocation);
router.patch('/:id/deactivate', ...adminOnly, deactivateLocation);
router.delete('/:id', ...adminOnly, deleteLocation);

export default router;
