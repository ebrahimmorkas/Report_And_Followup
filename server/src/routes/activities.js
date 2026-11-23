import { Router } from 'express';
import Activity from '../models/Activity.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import { isValidId } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const adminOnly = requireRole(ROLES.SUPER_ADMIN);

// ?type=report|followup filters to activities shown in that tab.
// Non-admins only ever see active activities; admins can pass ?active=true.
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.type === 'report') filter.showInReport = true;
  if (req.query.type === 'followup') filter.showInFollowUp = true;
  if (req.user.role !== ROLES.SUPER_ADMIN || req.query.active === 'true') filter.isActive = true;
  const activities = await Activity.find(filter).sort({ name: 1 }).lean();
  res.json({ activities });
});

function readBody(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const showInReport = Boolean(body.showInReport);
  const showInFollowUp = Boolean(body.showInFollowUp);
  if (!name) return { error: 'Activity name is required' };
  if (!showInReport && !showInFollowUp) return { error: 'Select Report, Follow-up, or both' };
  const data = { name, showInReport, showInFollowUp };
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  return { data };
}

const yesNo = (v) => (v ? 'Yes' : 'No');
const snap = (a) => ({ Name: a.name, Report: yesNo(a.showInReport), 'Follow-up': yesNo(a.showInFollowUp), Active: yesNo(a.isActive) });

function duplicate(res, e) {
  if (e.code === 11000) return res.status(409).json({ message: 'An activity with this name already exists' });
  throw e;
}

router.post('/', adminOnly, async (req, res) => {
  const { data, error } = readBody(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const activity = await Activity.create(data);
    await audit(req, { action: 'CREATE', entity: 'Activity', entityId: activity._id, summary: `Added activity ${activity.name}`, after: snap(activity) });
    res.status(201).json({ activity });
  } catch (e) {
    duplicate(res, e);
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Activity not found' });
  const { data, error } = readBody(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const before = await Activity.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'Activity not found' });
    const activity = await Activity.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    await audit(req, {
      action: 'UPDATE',
      entity: 'Activity',
      entityId: activity._id,
      summary: `Edited activity ${activity.name}`,
      before: snap(before),
      after: snap(activity),
    });
    res.json({ activity });
  } catch (e) {
    duplicate(res, e);
  }
});

export default router;
