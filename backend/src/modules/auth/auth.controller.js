import { findUserByUsername, generateTokensForUser, rotateRefreshToken, createPasswordResetToken, consumePasswordResetToken } from './auth.service.js';
import User from './auth.model.js';
import { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.validation.js';
import { verifyToken } from '../../config/jwt.js';

const COOKIE_NAME = 'sq_refresh';

export const login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    const { username, password, rememberMe } = value;
    const user = await findUserByUsername(username);
    if (!user) return res.status(400).json({ message: 'Invalid username or password' });
    if (user.status !== 'ACTIVE') return res.status(403).json({ message: 'Account not active' });
    if (user.lockUntil && user.lockUntil > new Date()) return res.status(403).json({ message: 'Account locked. Try later.' });

    const match = await user.comparePassword(password);
    if (!match) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    // success
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const { accessToken, refreshToken } = await generateTokensForUser(user, rememberMe);

    res.cookie(COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    });

    const payload = { accessToken, user: { userId: user._id.toString(), username: user.username, role: user.role, mustChangePassword: user.mustChangePassword } };
    return res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const { accessToken, refreshToken, user } = await rotateRefreshToken(token);
    res.cookie(COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({ accessToken, user: { userId: user._id.toString(), username: user.username, role: user.role, mustChangePassword: user.mustChangePassword } });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (token) {
      try {
        const decoded = verifyToken(token, true);
        const user = await User.findById(decoded.userId).select('+refreshTokenHash');
        if (user) await user.clearRefreshToken();
      } catch (e) {
        // ignore
      }
    }
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    return res.status(200).json({ message: 'Logged out' });
  } catch (err) { next(err); }
};

export const changePassword = async (req, res, next) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });
    const user = await User.findById(req.user.userId).select('+password +refreshTokenHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const ok = await user.comparePassword(value.oldPassword);
    if (!ok) return res.status(400).json({ message: 'Invalid old password' });
    user.password = value.newPassword;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();
    // invalidate refresh tokens
    await user.clearRefreshToken();
    return res.status(200).json({ message: 'Password updated' });
  } catch (err) { next(err); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });
    const user = await User.findOne({ email: value.email });
    if (!user) return res.status(200).json({ message: 'If an account exists, password reset instructions have been sent.' });
    const token = await createPasswordResetToken(user._id);
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    const resetLink = `${clientOrigin}/reset-password?token=${token}`;
    const { sendPasswordResetEmail } = await import('../notifications/email.service.js');
    await sendPasswordResetEmail({ to: user.email, resetLink });
    return res.status(200).json({ message: 'If an account exists, password reset instructions have been sent.' });
  } catch (err) { next(err); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });
    const userId = await consumePasswordResetToken(value.token);
    const user = await User.findById(userId).select('+password +refreshTokenHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = value.newPassword;
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();
    await user.clearRefreshToken();
    return res.status(200).json({ message: 'Password reset' });
  } catch (err) { next(err); }
};
// Auth controller placeholder.
