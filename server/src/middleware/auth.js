import jwt from 'jsonwebtoken';
import User, { ROLES } from '../models/User.js';

export const COOKIE_NAME = 'token';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function expiresInMs() {
  const raw = process.env.JWT_EXPIRES_IN || '1d';
  const m = /^(\d+)([smhd])$/.exec(raw);
  if (!m) return 24 * 60 * 60 * 1000;
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]];
  return Number(m[1]) * unit;
}

export function setAuthCookie(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: expiresInMs() });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'Not authenticated' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Account not found or inactive' });
  }
  // Tokens issued before the last password change are no longer valid.
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Password changed, please log in again' });
  }

  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Forbidden' });

export const isSuperAdmin = (user) => user?.role === ROLES.SUPER_ADMIN;
