import { Router } from 'express';
import { optionalProtect, protect, authorizePermission } from '../../middlewares/auth.middleware.js';
import { createService, listServices, updateService, deleteService } from './service.controller.js';

const router = Router();
const manageServices = [protect, authorizePermission('providers.manage')];

router.get('/', optionalProtect, listServices);
router.post('/', ...manageServices, createService);
router.patch('/:code', ...manageServices, updateService);
router.delete('/:code', ...manageServices, deleteService);

export default router;
