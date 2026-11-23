import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User, { ROLES } from '../models/User.js';
import Jamiat from '../models/Jamiat.js';
import { normalizeMobile } from '../utils/mobile.js';
import { isValidId } from '../utils/http.js';
import { publicUser } from './auth.js';

const router = Router();

async function validateJamiats(ids) {
  if (!Array.isArray(ids) || !ids.every(isValidId)) return null;
  const unique = [...new Set(ids)];
  const count = await Jamiat.countDocuments({ _id: { $in: unique } });
  return count === unique.length ? unique : null;
}

const populateUser = (id) => User.findById(id).populate('jamiats', 'name isActive').lean();

/**
 * A Jamiat may belong to only one ACTIVE JC at a time (inactive JCs do not hold Jamiats).
 * Returns the other active JCs that already hold any of `jamiatIds`.
 */
async function findConflicts(jamiatIds, excludeUserId) {
  if (!jamiatIds.length) return [];
  const filter = { role: ROLES.JC, isActive: true, jamiats: { $in: jamiatIds } };
  if (excludeUserId) filter._id = { $ne: excludeUserId };
  const owners = await User.find(filter).populate('jamiats', 'name').lean();

  const wanted = new Set(jamiatIds.map(String));
  const conflicts = [];
  for (const owner of owners) {
    for (const j of owner.jamiats) {
      if (wanted.has(String(j._id))) {
        conflicts.push({ jamiatId: j._id, jamiatName: j.name, userId: owner._id, userName: owner.name, userMobile: owner.mobile });
      }
    }
  }
  return conflicts;
}

/**
 * Checks Jamiat ownership before saving an active JC.
 * - No conflicts: returns true.
 * - Conflicts and the request did not confirm (`transfer: true`): sends 409 with the list, returns false.
 * - Conflicts and confirmed: removes those Jamiats from their current JCs, returns true.
 * Report / Follow-up entries belong to the Jamiat, so they move with it automatically.
 */
async function checkOwnership(req, res, jamiatIds, excludeUserId) {
  const conflicts = await findConflicts(jamiatIds, excludeUserId);
  if (!conflicts.length) return true;

  if (req.body?.transfer !== true) {
    const list = conflicts.map((c) => `${c.jamiatName} (assigned to ${c.userName})`).join(', ');
    res.status(409).json({ code: 'JAMIAT_CONFLICT', message: `Already assigned: ${list}`, conflicts });
    return false;
  }

  const moving = conflicts.map((c) => c.jamiatId);
  const fromUsers = [...new Set(conflicts.map((c) => String(c.userId)))];
  await User.updateMany({ _id: { $in: fromUsers } }, { $pull: { jamiats: { $in: moving } } });
  return true;
}

router.get('/', async (req, res) => {
  const users = await User.find().populate('jamiats', 'name isActive').sort({ role: -1, name: 1 }).lean();
  res.json({ users: users.map(publicUser) });
});

router.post('/', async (req, res) => {
  const { name, password } = req.body || {};
  const role = req.body?.role || ROLES.JC;
  const mobile = normalizeMobile(req.body?.mobile);

  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  if (!mobile) return res.status(400).json({ message: 'Mobile must be a valid 10-digit number' });
  if (typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (!Object.values(ROLES).includes(role)) return res.status(400).json({ message: 'Invalid role' });

  let jamiats = [];
  if (role === ROLES.JC) {
    jamiats = await validateJamiats(req.body?.jamiats || []);
    if (!jamiats) return res.status(400).json({ message: 'Invalid Jamiat selection' });
    if (!jamiats.length) return res.status(400).json({ message: 'Assign at least one Jamiat to a JC' });
  }

  if (await User.exists({ mobile })) {
    return res.status(409).json({ message: 'A user with this mobile number already exists' });
  }

  if (role === ROLES.JC && !(await checkOwnership(req, res, jamiats, null))) return;

  const user = await User.create({
    name: name.trim(),
    mobile,
    password: await bcrypt.hash(password, 10),
    role,
    jamiats,
  });
  res.status(201).json({ user: publicUser(await populateUser(user._id)) });
});

router.put('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: 'User not found' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const isSelf = String(user._id) === String(req.user._id);
  const { name, password, isActive } = req.body || {};
  const role = req.body?.role ?? user.role;

  if (!Object.values(ROLES).includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (isSelf && (role !== user.role || isActive === false)) {
    return res.status(400).json({ message: 'You cannot change your own role or deactivate yourself' });
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    user.name = name.trim();
  }

  if (req.body?.mobile !== undefined) {
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile) return res.status(400).json({ message: 'Mobile must be a valid 10-digit number' });
    if (mobile !== user.mobile && (await User.exists({ mobile, _id: { $ne: user._id } }))) {
      return res.status(409).json({ message: 'A user with this mobile number already exists' });
    }
    user.mobile = mobile;
  }

  user.role = role;
  if (role === ROLES.JC) {
    if (req.body?.jamiats !== undefined) {
      const jamiats = await validateJamiats(req.body.jamiats);
      if (!jamiats) return res.status(400).json({ message: 'Invalid Jamiat selection' });
      user.jamiats = jamiats;
    }
    if (!user.jamiats.length) return res.status(400).json({ message: 'Assign at least one Jamiat to a JC' });
  } else {
    user.jamiats = [];
  }

  if (typeof isActive === 'boolean') user.isActive = isActive;

  // Optional password reset by the super admin.
  if (password !== undefined && password !== '') {
    if (typeof password !== 'string' || password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    user.password = await bcrypt.hash(password, 10);
    user.passwordChangedAt = new Date();
  }

  // Ownership is checked last, so nothing is transferred if another validation fails.
  // Also covers re-activating a JC whose Jamiats were given to someone else meanwhile.
  if (user.role === ROLES.JC && user.isActive && !(await checkOwnership(req, res, user.jamiats, user._id))) return;

  await user.save();
  res.json({ user: publicUser(await populateUser(user._id)) });
});

export default router;
