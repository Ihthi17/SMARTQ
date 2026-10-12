import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '15m';
const REFRESH_DEFAULT = process.env.REFRESH_EXPIRES || '1d';

export const signAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
};

export const signRefreshToken = (payload, expires) => {
  const options = {};
  if (expires) options.expiresIn = expires;
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, options);
};

export const verifyToken = (token, isRefresh = false) => {
  const secret = isRefresh ? (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET) : process.env.JWT_SECRET;
  return jwt.verify(token, secret);
};

export const createSessionId = () => randomUUID();
