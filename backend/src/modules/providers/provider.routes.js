import { Router } from 'express';
import { optionalProtect, protect, authorizePermission } from '../../middlewares/auth.middleware.js';
import { listProviders, createProvider, updateProvider, deactivateProvider } from './provider.controller.js';

const router = Router();
const manageProviders = [protect, authorizePermission('providers.manage')];

router.get('/', optionalProtect, listProviders);
router.post('/', ...manageProviders, createProvider);
router.patch('/:id', ...manageProviders, updateProvider);
router.delete('/:id', ...manageProviders, deactivateProvider);

export default router;
