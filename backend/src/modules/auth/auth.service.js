import User from './auth.model.js';
import PasswordResetToken from '../../models/passwordResetToken.model.js';
import crypto from 'crypto';
import { signAccessToken, signRefreshToken, createSessionId, verifyToken } from '../../config/jwt.js';
import bcrypt from 'bcryptjs';

const ACCESS_EXP = '15m';
const REFRESH_SHORT = '1d';
const REFRESH_LONG = '30d';

export const findUserByUsername = async (username) =>
  User.findOne({ username }).select('+password +refreshTokenHash');

export const generateTokensForUser = async (user, rememberMe = false) => {
  const sessionId = createSessionId();
  const accessToken = signAccessToken({ userId: user._id, username: user.username, role: user.role, sessionId });
  const refreshToken = signRefreshToken({ userId: user._id, sessionId }, rememberMe ? REFRESH_LONG : REFRESH_SHORT);
  await user.setRefreshTokenHash(refreshToken);
  return { accessToken, refreshToken };
};

export const rotateRefreshToken = async (oldToken) => {
  try {
    const decoded = verifyToken(oldToken, true);
    const user = await User.findById(decoded.userId).select('+password +refreshTokenHash');
    if (!user) throw new Error('Invalid token');
    const matches = await bcrypt.compare(oldToken, user.refreshTokenHash || '');
    if (!matches) {
      // possible reuse - clear stored token
      await user.clearRefreshToken();
      throw new Error('Invalid token');
    }
    // create new tokens
    const remember = false; // expiry encoded in token not tracked here -> default short
    const sessionId = createSessionId();
    const accessToken = signAccessToken({ userId: user._id, username: user.username, role: user.role, sessionId });
    const refreshToken = signRefreshToken({ userId: user._id, sessionId }, REFRESH_SHORT);
    await user.setRefreshTokenHash(refreshToken);
    return { accessToken, refreshToken, user };
  } catch (err) {
    throw err;
  }
};

export const createPasswordResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await PasswordResetToken.create({ userId, tokenHash, expiresAt });
  return token;
};

export const consumePasswordResetToken = async (token) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await PasswordResetToken.findOne({ tokenHash });
  if (!record) throw new Error('Invalid token');
  if (record.used) throw new Error('Token already used');
  if (record.expiresAt < new Date()) throw new Error('Token expired');
  record.used = true;
  await record.save();
  return record.userId;
};
