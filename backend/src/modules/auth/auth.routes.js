import express from 'express';
import { login, refresh, logout, changePassword, forgotPassword, resetPassword } from './auth.controller.js';
import { protect, authorizeRoles } from '../../middlewares/auth.middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { message: 'Too many login attempts. Try again later.' } });

router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/change-password', protect, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
// Auth routes placeholder.
