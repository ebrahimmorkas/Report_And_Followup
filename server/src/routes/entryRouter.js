import { Router } from 'express';
import ExcelJS from 'exceljs';
import Jamaat from '../models/Jamaat.js';
import Jamiat from '../models/Jamiat.js';
import Activity from '../models/Activity.js';
import { ROLES } from '../models/User.js';
import { requireRole } from '../middleware/auth.js';
import { isValidId } from '../utils/http.js';
import { parseDateOnly, formatDate } from '../utils/dates.js';
import { activityLabel } from '../models/entryActivity.js';

const POPULATE = [
  { path: 'jamiat', select: 'name' },
  { path: 'jamaat', select: 'name' },
  { path: 'activity', select: 'name' },
  { path: 'inPlaceOf', select: 'name' },
  { path: 'createdBy', select: 'name mobile' },
  { path: 'updatedBy', select: 'name mobile' },
];

/**
 * Builds a CRUD + export router shared by Report and Follow-up.
 *
 * @param {object} cfg
 * @param {import('mongoose').Model} cfg.Model
 * @param {string} cfg.title  'Report' | 'Follow-up' (used in messages)
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

    for (const val of [jamiat, jamaat, activity]) {
      if (val && !isValidId(val)) return null;
    }
    if (jamaat) filter.jamaat = jamaat;
    // An activity filter also matches new activities done in place of it.
    if (activity) filter.$or = [{ activity }, { inPlaceOf: activity }];

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

  const findListedActivity = (id) =>
    isValidId(id) ? Activity.findOne({ _id: id, isActive: true, [cfg.activityFlag]: true }).lean() : null;

  /**
   * Resolves either a listed activity or a new (custom) activity with an optional "in place of".
   * Returns the activity fields to store, a label for messages, or an error.
   */
  async function resolveActivity(body) {
    const custom = typeof body.customActivity === 'string' ? body.customActivity.trim().replace(/\s+/g, ' ') : '';

    if (!custom) {
      if (!isValidId(body.activity)) return { error: 'Select an Activity' };
      const activity = await findListedActivity(body.activity);
      if (!activity) return { error: 'Activity not found or not available here' };
      return {
        fields: { activity: activity._id, customActivity: '', inPlaceOf: null, activityKey: `a:${activity._id}` },
        label: activity.name,
      };
    }

    if (custom.length > 100) return { error: 'New activity name is too long (max 100 characters)' };
    const listed = await Activity.findOne({ name: custom }).collation({ locale: 'en', strength: 2 }).lean();
    if (listed) return { error: `"${listed.name}" is already in the activity list. Select it from the dropdown instead.` };

    let inPlaceOf = null;
    if (body.inPlaceOf) {
      inPlaceOf = await findListedActivity(body.inPlaceOf);
      if (!inPlaceOf) return { error: '"In place of" activity not found or not available here' };
    }
    return {
      fields: {
        activity: null,
        customActivity: custom,
        inPlaceOf: inPlaceOf?._id ?? null,
        activityKey: inPlaceOf ? `a:${inPlaceOf._id}` : `c:${custom.toLowerCase()}`,
      },
      label: inPlaceOf ? `${inPlaceOf.name} (done as ${custom})` : custom,
    };
  }

  /** Validates jamaat/activity access and the duplicate rule; returns the full document payload. */
  async function buildDoc(req, excludeId = null) {
    const body = req.body || {};
    const { data, error } = cfg.readPayload(body);
    if (error) return { error };

    if (!isValidId(body.jamaat)) return { error: 'Select a Jamaat' };
    const jamaat = await Jamaat.findOne({ _id: body.jamaat, isActive: true }).lean();
    if (!jamaat) return { error: 'Jamaat not found or inactive' };
    const allowed = req.user.jamiats.some((id) => String(id) === String(jamaat.jamiat));
    if (!allowed) return { status: 403, error: 'You do not have access to this Jamaat' };
    if (!(await Jamiat.exists({ _id: jamaat.jamiat, isActive: true })))
      return { error: 'This Jamiat is inactive' };

    const act = await resolveActivity(body);
    if (act.error) return { error: act.error };

    // One entry per Jamaat per activity (any date).
    const dupFilter = { jamaat: jamaat._id, activityKey: act.fields.activityKey };
    if (excludeId) dupFilter._id = { $ne: excludeId };
    const dup = await cfg.Model.findOne(dupFilter).populate(POPULATE).lean();
    if (dup) return { status: 409, error: duplicateMessage(dup, jamaat.name) };

    return { doc: { ...data, ...act.fields, jamaat: jamaat._id, jamiat: jamaat.jamiat } };
  }

  function duplicateMessage(dup, jamaatName) {
    return (
      `A ${cfg.title} entry for ${activityLabel(dup)} in ${jamaatName} already exists ` +
      `(dated ${formatDate(dup[cfg.dateField])}, entered by ${dup.createdBy?.name || 'unknown'}). ` +
      'Edit that entry instead of adding a new one.'
    );
  }

  /** Saves, turning a unique-index race into the same friendly 409. */
  async function saveWithDuplicateGuard(fn, res) {
    try {
      return await fn();
    } catch (e) {
      if (e.code === 11000) {
        res.status(409).json({ message: `This activity has already been entered for this Jamaat in ${cfg.title}.` });
        return null;
      }
      throw e;
    }
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
    const created = await saveWithDuplicateGuard(() => cfg.Model.create({ ...doc, createdBy: req.user._id }), res);
    if (!created) return;
    const item = await cfg.Model.findById(created._id).populate(POPULATE).lean();
    res.status(201).json({ item });
  });

  router.put('/:id', jcOnly, async (req, res) => {
    const existing = await findOwned(req);
    if (!existing) return res.status(404).json({ message: 'Entry not found' });
    const { doc, error, status } = await buildDoc(req, existing._id);
    if (error) return res.status(status || 400).json({ message: error });
    existing.set({ ...doc, updatedBy: req.user._id });
    if (!(await saveWithDuplicateGuard(() => existing.save(), res))) return;
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
