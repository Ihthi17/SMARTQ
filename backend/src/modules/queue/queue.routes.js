import { Router } from 'express';
import { protect, authorizePermission } from '../../middlewares/auth.middleware.js';
import { getSnapshot, start, nextToken, startCurrent, complete, pause, stop } from './queue.controller.js';

const router = Router();
const manageQueue = [protect, authorizePermission('queue.manage')];

router.get('/', getSnapshot);
router.post('/:providerId/start', ...manageQueue, start);
router.post('/:providerId/stop', ...manageQueue, stop);
router.post('/:providerId/pause', ...manageQueue, pause);
router.post('/:providerId/next', ...manageQueue, nextToken);
router.post('/:providerId/current/start', ...manageQueue, startCurrent);
router.post('/:providerId/current/complete', ...manageQueue, complete);

export default router;
