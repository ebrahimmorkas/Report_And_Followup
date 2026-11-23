import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { normalizeMobile } from '../utils/mobile.js';
import jwt from 'jsonwebtoken';
import { requireAuth, setAuthCookie, clearAuthCookie, COOKIE_NAME } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later' },
});

export function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    jamiats: user.jamiats,
    isActive: user.isActive,
  };
}

router.post('/login', loginLimiter, async (req, res) => {
  const mobile = normalizeMobile(req.body?.mobile);
  const password = req.body?.password;
  if (!mobile || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Enter a valid 10-digit mobile number and password' });
  }

  const user = await User.findOne({ mobile }).select('+password');
  const ok = user && (await bcrypt.compare(password, user.password));
  if (!ok || !user.isActive) {
    const reason = !user ? 'unknown mobile' : !ok ? 'wrong password' : 'inactive account';
    await audit(req, {
      action: 'LOGIN_FAILED',
      entity: 'Auth',
      entityId: user?._id ?? null,
      summary: `Failed login for ${mobile} (${reason})`,
      actor: user ? { _id: user._id, name: user.name, mobile: user.mobile } : { _id: null, name: '', mobile },
    });
    if (!ok) return res.status(401).json({ message: 'Invalid mobile number or password' });
    return res.status(403).json({ message: 'Your account is inactive' });
  }

  setAuthCookie(res, user);
  await audit(req, { action: 'LOGIN', entity: 'Auth', entityId: user._id, summary: `${user.name} logged in`, actor: user });
  const populated = await User.findById(user._id).populate('jamiats', 'name isActive').lean();
  res.json({ user: publicUser(populated) });
});

router.post('/logout', async (req, res) => {
  // Record who logged out, if the session is still valid.
  try {
    const payload = jwt.verify(req.cookies?.[COOKIE_NAME] || '', process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).lean();
    if (user) await audit(req, { action: 'LOGOUT', entity: 'Auth', entityId: user._id, summary: `${user.name} logged out`, actor: user });
  } catch {
    // no valid session: nothing to record
  }
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).populate('jamiats', 'name isActive').lean();
  res.json({ user: publicUser(user) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }
  const user = await User.findById(req.user._id).select('+password');
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(400).json({ message: 'New password must be different from the current one' });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  user.passwordChangedAt = new Date();
  await user.save();
  // Re-issue the cookie so the current session stays logged in.
  setAuthCookie(res, user);
  await audit(req, { action: 'PASSWORD_CHANGE', entity: 'Auth', entityId: user._id, summary: `${user.name} changed their password` });
  res.json({ message: 'Password changed successfully' });
});

export default router;
