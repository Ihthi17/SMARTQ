import express, { Router } from 'express';
import { protect, authorizePermission } from '../../middlewares/auth.middleware.js';
import {
  getBranding, getSettings, updateSettings, testSmtp, testNotification,
  listBackups, createBackup, downloadBackup, restoreBackup, listAuditLogs, getMapsKey,
} from './settings.controller.js';

const router = Router();
const viewSettings = [protect, authorizePermission('settings.view')];
const manageSettings = [protect, authorizePermission('settings.manage')];

router.get('/branding', getBranding);
router.get('/maps-key', getMapsKey);
router.get('/',           ...viewSettings, getSettings);
router.patch('/',         ...manageSettings, updateSettings);
router.post('/smtp/test', ...manageSettings, testSmtp);
router.post('/notifications/test', ...manageSettings, testNotification);
router.get('/audit', ...viewSettings, listAuditLogs);
router.get('/backup', ...manageSettings, listBackups);
router.post('/backup', ...manageSettings, createBackup);
router.get('/backup/:name/download', ...manageSettings, downloadBackup);
router.post('/backup/restore', ...manageSettings, express.json({ limit: '50mb' }), restoreBackup);

export default router;
