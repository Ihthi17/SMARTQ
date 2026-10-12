import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * IPv6-safe key generator wrapper
 */
const keyGen = (req, res) => ipKeyGenerator(req.ip);

/**
 * Rate limiter for QR scan endpoint
 * Limit: 30 requests per minute per IP
 * Prevents brute force scanning attempts
 */
export const scanRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many scan attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
  skip: (req) => {
    // Don't rate limit for super admin in development
    if (process.env.NODE_ENV === 'development' && req.user?.role === 'SUPER_ADMIN') {
      return true;
    }
    return false;
  },
});

/**
 * Rate limiter for check-in endpoint
 * Limit: 20 requests per minute per IP
 * Prevents rapid check-in attempts
 */
export const checkInRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many check-in attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
  skip: (req) => {
    // Don't rate limit for super admin in development
    if (process.env.NODE_ENV === 'development' && req.user?.role === 'SUPER_ADMIN') {
      return true;
    }
    return false;
  },
});

/**
 * Rate limiter for QR token generation endpoint
 * Limit: 10 requests per minute per user
 * Prevents token spam
 */
export const qrTokenRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: (req, res) => {
    // Rate limit by user ID instead of IP for authenticated requests
    // User ID takes priority, fall back to IP
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }
    return keyGen(req, res);
  },
  message: 'Too many QR token requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for confirmation endpoint
 * Limit: 10 requests per minute per IP
 * Prevents rapid confirmations
 */
export const confirmRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many confirmation requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGen,
});
