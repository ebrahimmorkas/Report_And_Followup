import { Router } from 'express';
import AuditLog, { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../models/AuditLog.js';
import { parseDateOnly } from '../utils/dates.js';
import { isValidId } from '../utils/http.js';

const router = Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/audit?entity=&action=&actor=&entityId=&from=&to=&q=&page=&limit=
router.get('/', async (req, res) => {
  const { entity, action, actor, entityId, from, to, q } = req.query;
  const filter = {};

  if (entity) {
    if (!AUDIT_ENTITIES.includes(entity)) return res.status(400).json({ message: 'Invalid type' });
    filter.entity = entity;
  }
  if (action) {
    if (!AUDIT_ACTIONS.includes(action)) return res.status(400).json({ message: 'Invalid action' });
    filter.action = action;
  }
  for (const [key, val] of [['actor', actor], ['entityId', entityId]]) {
    if (!val) continue;
    if (!isValidId(val)) return res.status(400).json({ message: `Invalid ${key}` });
    filter[key] = val;
  }

  const fromDate = from ? parseDateOnly(from) : null;
  const toDate = to ? parseDateOnly(to) : null;
  if ((from && !fromDate) || (to && !toDate)) return res.status(400).json({ message: 'Invalid dates' });
  if (fromDate || toDate) {
    // Dates are whole days in India time.
    filter.at = {};
    if (fromDate) filter.at.$gte = new Date(fromDate.getTime() - 330 * 60000);
    if (toDate) filter.at.$lt = new Date(toDate.getTime() + 864e5 - 330 * 60000);
  }

  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim().slice(0, 100)), 'i');
    filter.$or = [{ summary: rx }, { actorName: rx }, { actorMobile: rx }];
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1), entities: AUDIT_ENTITIES, actions: AUDIT_ACTIONS });
});

export default router;
