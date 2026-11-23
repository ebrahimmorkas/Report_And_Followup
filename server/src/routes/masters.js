import { Router } from 'express';
import Jamiat from '../models/Jamiat.js';
import Jamaat from '../models/Jamaat.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import { isValidId } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const adminOnly = requireRole(ROLES.SUPER_ADMIN);
const isAdmin = (req) => req.user.role === ROLES.SUPER_ADMIN;

/** Super admin sees every Jamiat; a JC only the ones assigned to them. */
const scopeFilter = (req) => (isAdmin(req) ? {} : { _id: { $in: req.user.jamiats } });

const readName = (body) => (typeof body?.name === 'string' ? body.name.trim().toUpperCase() : '');

const jamiatSnap = (j) => ({ Name: j.name, Active: j.isActive ? 'Yes' : 'No' });
async function jamaatSnap(j) {
  const jamiat = await Jamiat.findById(j.jamiat).select('name').lean();
  return { Name: j.name, Jamiat: jamiat?.name || '', Active: j.isActive ? 'Yes' : 'No' };
}

function handleDuplicate(res, e, message) {
  if (e.code === 11000) return res.status(409).json({ message });
  throw e;
}

// ---------- Jamiats ----------
router.get('/jamiats', async (req, res) => {
  const filter = scopeFilter(req);
  if (!isAdmin(req) || req.query.active === 'true') filter.isActive = true;
  const jamiats = await Jamiat.find(filter).sort({ name: 1 }).lean();

  if (isAdmin(req) && req.query.withCounts === 'true') {
    const counts = await Jamaat.aggregate([{ $group: { _id: '$jamiat', total: { $sum: 1 } } }]);
    const map = new Map(counts.map((c) => [String(c._id), c.total]));
    jamiats.forEach((j) => (j.jamaatCount = map.get(String(j._id)) || 0));
  }
  res.json({ jamiats });
});

router.post('/jamiats', adminOnly, async (req, res) => {
  const name = readName(req.body);
  if (!name) return res.status(400).json({ message: 'Jamiat name is required' });
  try {
    const jamiat = await Jamiat.create({ name });
    await audit(req, { action: 'CREATE', entity: 'Jamiat', entityId: jamiat._id, summary: `Added Jamiat ${jamiat.name}`, after: jamiatSnap(jamiat) });
    res.status(201).json({ jamiat });
  } catch (e) {
    handleDuplicate(res, e, 'This Jamiat already exists');
  }
});

router.put('/jamiats/:id', adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Jamiat not found' });
  const update = {};
  if (req.body?.name !== undefined) {
    update.name = readName(req.body);
    if (!update.name) return res.status(400).json({ message: 'Jamiat name is required' });
  }
  if (typeof req.body?.isActive === 'boolean') update.isActive = req.body.isActive;
  try {
    const before = await Jamiat.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'Jamiat not found' });
    const jamiat = await Jamiat.findByIdAndUpdate(req.params.id, update, { new: true });
    await audit(req, {
      action: 'UPDATE',
      entity: 'Jamiat',
      entityId: jamiat._id,
      summary: `Edited Jamiat ${jamiat.name}`,
      before: jamiatSnap(before),
      after: jamiatSnap(jamiat),
    });
    res.json({ jamiat });
  } catch (e) {
    handleDuplicate(res, e, 'This Jamiat already exists');
  }
});

// ---------- Jamaats ----------
// GET /jamaats?jamiat=<id>
router.get('/jamaats', async (req, res) => {
  const { jamiat } = req.query;
  if (!isValidId(jamiat)) return res.status(400).json({ message: 'Select a Jamiat' });

  const allowed = await Jamiat.exists({ $and: [{ _id: jamiat }, scopeFilter(req)] });
  if (!allowed) return res.status(403).json({ message: 'You do not have access to this Jamiat' });

  const filter = { jamiat };
  if (!isAdmin(req) || req.query.active === 'true') filter.isActive = true;
  const jamaats = await Jamaat.find(filter).sort({ name: 1 }).lean();
  res.json({ jamaats });
});

router.post('/jamaats', adminOnly, async (req, res) => {
  const name = readName(req.body);
  const { jamiat } = req.body || {};
  if (!name) return res.status(400).json({ message: 'Jamaat name is required' });
  if (!isValidId(jamiat) || !(await Jamiat.exists({ _id: jamiat })))
    return res.status(400).json({ message: 'Select a valid Jamiat' });
  try {
    const jamaat = await Jamaat.create({ name, jamiat });
    const snap = await jamaatSnap(jamaat);
    await audit(req, { action: 'CREATE', entity: 'Jamaat', entityId: jamaat._id, summary: `Added Jamaat ${jamaat.name} in ${snap.Jamiat}`, after: snap });
    res.status(201).json({ jamaat });
  } catch (e) {
    handleDuplicate(res, e, 'This Jamaat already exists in the Jamiat');
  }
});

router.put('/jamaats/:id', adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Jamaat not found' });
  const update = {};
  if (req.body?.name !== undefined) {
    update.name = readName(req.body);
    if (!update.name) return res.status(400).json({ message: 'Jamaat name is required' });
  }
  if (typeof req.body?.isActive === 'boolean') update.isActive = req.body.isActive;
  try {
    const before = await Jamaat.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'Jamaat not found' });
    const jamaat = await Jamaat.findByIdAndUpdate(req.params.id, update, { new: true });
    const after = await jamaatSnap(jamaat);
    await audit(req, {
      action: 'UPDATE',
      entity: 'Jamaat',
      entityId: jamaat._id,
      summary: `Edited Jamaat ${jamaat.name} in ${after.Jamiat}`,
      before: await jamaatSnap(before),
      after,
    });
    res.json({ jamaat });
  } catch (e) {
    handleDuplicate(res, e, 'This Jamaat already exists in the Jamiat');
  }
});

export default router;
