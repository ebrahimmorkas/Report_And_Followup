import { Router } from 'express';
import ExcelJS from 'exceljs';
import Jamaat from '../models/Jamaat.js';
import Jamiat from '../models/Jamiat.js';
import Activity from '../models/Activity.js';
import { ROLES } from '../models/User.js';
import { requireRole } from '../middleware/auth.js';
import { isValidId } from '../utils/http.js';
import { parseDateOnly } from '../utils/dates.js';

const POPULATE = [
  { path: 'jamiat', select: 'name' },
  { path: 'jamaat', select: 'name' },
  { path: 'activity', select: 'name' },
  { path: 'createdBy', select: 'name mobile' },
  { path: 'updatedBy', select: 'name mobile' },
];

/**
 * Builds a CRUD + export router shared by Report and Follow-up.
 *
 * @param {object} cfg
 * @param {import('mongoose').Model} cfg.Model
 * @param {'showInReport'|'showInFollowUp'} cfg.activityFlag  which activities are allowed
 * @param {string} cfg.dateField   main date field used for sorting / date filters
 * @param {(body:any)=>({data?:object,error?:string})} cfg.readPayload  validates type-specific fields
 * @param {string} cfg.sheetName
 * @param {{header:string,key:string,width:number}[]} cfg.columns
 * @param {(doc:any)=>object} cfg.toRow
 */
export function createEntryRouter(cfg) {
  const router = Router();
  const jcOnly = requireRole(ROLES.JC);

  /** Builds the Mongo filter from query params, restricted to the user's Jamiats. */
  function buildFilter(req) {
    const { jamiat, jamaat, activity, from, to } = req.query;
    const filter = {};

    if (req.user.role !== ROLES.SUPER_ADMIN) {
      const allowed = req.user.jamiats.map(String);
      if (jamiat && !allowed.includes(String(jamiat))) return null;
      filter.jamiat = jamiat ? jamiat : { $in: req.user.jamiats };
    } else if (jamiat) {
      filter.jamiat = jamiat;
    }

    for (const [key, val] of [['jamiat', jamiat], ['jamaat', jamaat], ['activity', activity]]) {
      if (val && !isValidId(val)) return null;
      if (val && key !== 'jamiat') filter[key] = val;
    }

    const fromDate = from ? parseDateOnly(from) : null;
    const toDate = to ? parseDateOnly(to) : null;
    if ((from && !fromDate) || (to && !toDate)) return null;
    if (fromDate || toDate) {
      filter[cfg.dateField] = {};
      if (fromDate) filter[cfg.dateField].$gte = fromDate;
      if (toDate) filter[cfg.dateField].$lte = toDate;
    }
    return filter;
  }

  /** Validates jamaat/activity access and returns the full document payload. */
  async function buildDoc(req) {
    const { data, error } = cfg.readPayload(req.body || {});
    if (error) return { error };

    const { jamaat: jamaatId, activity: activityId } = req.body || {};
    if (!isValidId(jamaatId)) return { error: 'Select a Jamaat' };
    if (!isValidId(activityId)) return { error: 'Select an Activity' };

    const jamaat = await Jamaat.findOne({ _id: jamaatId, isActive: true }).lean();
    if (!jamaat) return { error: 'Jamaat not found or inactive' };
    const allowed = req.user.jamiats.some((id) => String(id) === String(jamaat.jamiat));
    if (!allowed) return { status: 403, error: 'You do not have access to this Jamaat' };
    if (!(await Jamiat.exists({ _id: jamaat.jamiat, isActive: true })))
      return { error: 'This Jamiat is inactive' };

    const activity = await Activity.findOne({ _id: activityId, isActive: true, [cfg.activityFlag]: true }).lean();
    if (!activity) return { error: 'Activity not found or not available here' };

    return { doc: { ...data, jamaat: jamaat._id, jamiat: jamaat.jamiat, activity: activity._id } };
  }

  async function findOwned(req) {
    if (!isValidId(req.params.id)) return null;
    return cfg.Model.findOne({ _id: req.params.id, jamiat: { $in: req.user.jamiats } });
  }

  router.get('/', async (req, res) => {
    const filter = buildFilter(req);
    if (!filter) return res.status(400).json({ message: 'Invalid filters' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [items, total] = await Promise.all([
      cfg.Model.find(filter)
        .sort({ [cfg.dateField]: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(POPULATE)
        .lean(),
      cfg.Model.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) });
  });

  router.get('/export', requireRole(ROLES.SUPER_ADMIN), async (req, res) => {
    const filter = buildFilter(req);
    if (!filter) return res.status(400).json({ message: 'Invalid filters' });

    const items = await cfg.Model.find(filter).sort({ [cfg.dateField]: -1, createdAt: -1 }).populate(POPULATE).lean();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(cfg.sheetName);
    ws.columns = cfg.columns;
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    items.forEach((doc) => ws.addRow(cfg.toRow(doc)));
    ws.eachRow((row) => (row.alignment = { vertical: 'top', wrapText: true }));

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${cfg.sheetName.replace(/\s+/g, '_')}_${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  router.post('/', jcOnly, async (req, res) => {
    const { doc, error, status } = await buildDoc(req);
    if (error) return res.status(status || 400).json({ message: error });
    const created = await cfg.Model.create({ ...doc, createdBy: req.user._id });
    const item = await cfg.Model.findById(created._id).populate(POPULATE).lean();
    res.status(201).json({ item });
  });

  router.put('/:id', jcOnly, async (req, res) => {
    const existing = await findOwned(req);
    if (!existing) return res.status(404).json({ message: 'Entry not found' });
    const { doc, error, status } = await buildDoc(req);
    if (error) return res.status(status || 400).json({ message: error });
    existing.set({ ...doc, updatedBy: req.user._id });
    await existing.save();
    const item = await cfg.Model.findById(existing._id).populate(POPULATE).lean();
    res.json({ item });
  });

  router.delete('/:id', jcOnly, async (req, res) => {
    const existing = await findOwned(req);
    if (!existing) return res.status(404).json({ message: 'Entry not found' });
    await existing.deleteOne();
    res.json({ message: 'Deleted' });
  });

  return router;
}

/** Validates an array of extra activities with the given item reader. */
export function readExtras(raw, readItem) {
  if (raw === undefined || raw === null) return { extras: [] };
  if (!Array.isArray(raw)) return { error: 'Invalid extra activities' };
  if (raw.length > 50) return { error: 'Too many extra activities' };
  const extras = [];
  for (const [i, item] of raw.entries()) {
    const result = readItem(item || {}, i + 1);
    if (result.error) return result;
    extras.push(result.value);
  }
  return { extras };
}
