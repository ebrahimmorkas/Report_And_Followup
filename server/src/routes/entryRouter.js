import { Router } from 'express';
import ExcelJS from 'exceljs';
import Jamaat from '../models/Jamaat.js';
import Jamiat from '../models/Jamiat.js';
import Activity, { CATEGORIES } from '../models/Activity.js';
import { ROLES } from '../models/User.js';
import { requireRole } from '../middleware/auth.js';
import { isValidId } from '../utils/http.js';
import { parseDateOnly, formatDate } from '../utils/dates.js';
import { activityLabel, categoryFilter, entryCategory, NOT_DELETED } from '../models/entryActivity.js';
import { audit } from '../utils/audit.js';

const POPULATE = [
  { path: 'jamiat', select: 'name' },
  { path: 'jamaat', select: 'name' },
  { path: 'activity', select: 'name category' },
  { path: 'inPlaceOf', select: 'name category' },
  { path: 'createdBy', select: 'name mobile' },
  { path: 'updatedBy', select: 'name mobile' },
  { path: 'deletedBy', select: 'name mobile' },
];

const sheetSafe = (name) => name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Sheet';

/**
 * Builds a CRUD + export router shared by Report and Follow-up.
 *
 * @param {object} cfg
 * @param {import('mongoose').Model} cfg.Model
 * @param {string} cfg.title  'Report' | 'Follow-up' (messages and audit log)
 * @param {'showInReport'|'showInFollowUp'} cfg.activityFlag  which activities are allowed
 * @param {string} cfg.dateField   main date field used for sorting / date filters
 * @param {(body:any)=>({data?:object,error?:string})} cfg.readPayload  validates type-specific fields
 * @param {(doc:any)=>object} cfg.snapshot  readable copy of an entry for the audit log
 * @param {string} cfg.exportName
 * @param {{header:string,key:string,width:number}[]} cfg.columns  export columns ('jamaat' and 'activity' keys required)
 * @param {(doc:any)=>object} cfg.toRow
 */
export function createEntryRouter(cfg) {
  const router = Router();
  const jcOnly = requireRole(ROLES.JC);
  const adminOnly = requireRole(ROLES.SUPER_ADMIN);

  /** Builds the Mongo filter from query params, restricted to the user's Jamiats. Excludes deleted entries. */
  async function buildFilter(req) {
    const { jamiat, jamaat, activity, category, from, to } = req.query;
    const filter = { ...NOT_DELETED };

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
    const and = [];
    if (activity) and.push({ $or: [{ activity }, { inPlaceOf: activity }] });
    if (category) {
      if (!CATEGORIES.includes(category)) return null;
      const ids = await Activity.find({ category }).distinct('_id');
      and.push(categoryFilter(category, ids));
    }
    if (and.length) filter.$and = and;

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
   * Returns the activity fields to store, or an error.
   */
  async function resolveActivity(body) {
    const custom = typeof body.customActivity === 'string' ? body.customActivity.trim().replace(/\s+/g, ' ') : '';

    if (!custom) {
      if (!isValidId(body.activity)) return { error: 'Select an Activity' };
      const activity = await findListedActivity(body.activity);
      if (!activity) return { error: 'Activity not found or not available here' };
      return { fields: { activity: activity._id, customActivity: '', customCategory: '', inPlaceOf: null, activityKey: `a:${activity._id}` } };
    }

    if (custom.length > 100) return { error: 'New activity name is too long (max 100 characters)' };
    const listed = await Activity.findOne({ name: custom }).collation({ locale: 'en', strength: 2 }).lean();
    if (listed) return { error: `"${listed.name}" is already in the activity list. Select it from the dropdown instead.` };
    if (!CATEGORIES.includes(body.customCategory)) return { error: 'Select a category for the new activity' };

    let inPlaceOf = null;
    if (body.inPlaceOf) {
      inPlaceOf = await findListedActivity(body.inPlaceOf);
      if (!inPlaceOf) return { error: '"In place of" activity not found or not available here' };
    }
    return {
      fields: {
        activity: null,
        customActivity: custom,
        customCategory: body.customCategory,
        inPlaceOf: inPlaceOf?._id ?? null,
        activityKey: inPlaceOf ? `a:${inPlaceOf._id}` : `c:${custom.toLowerCase()}`,
      },
    };
  }

  /** Returns the live entry that would be duplicated, if any. */
  function findDuplicate(jamaatId, activityKey, excludeId) {
    const filter = { ...NOT_DELETED, jamaat: jamaatId, activityKey };
    if (excludeId) filter._id = { $ne: excludeId };
    return cfg.Model.findOne(filter).populate(POPULATE).lean();
  }

  function duplicateMessage(dup) {
    return (
      `A ${cfg.title} entry for ${activityLabel(dup)} in ${dup.jamaat?.name} already exists ` +
      `(dated ${formatDate(dup[cfg.dateField])}, entered by ${dup.createdBy?.name || 'unknown'}). ` +
      'Edit that entry instead of adding a new one.'
    );
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

    // One live entry per Jamaat per activity (any date).
    const dup = await findDuplicate(jamaat._id, act.fields.activityKey, excludeId);
    if (dup) return { status: 409, error: duplicateMessage(dup) };

    return { doc: { ...data, ...act.fields, jamaat: jamaat._id, jamiat: jamaat.jamiat } };
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

  const loadPopulated = (id) => cfg.Model.findById(id).populate(POPULATE).lean();

  /** Live entry within the JC's Jamiats. */
  async function findOwned(req) {
    if (!isValidId(req.params.id)) return null;
    return cfg.Model.findOne({ _id: req.params.id, ...NOT_DELETED, jamiat: { $in: req.user.jamiats } });
  }

  const describe = (d) => `${activityLabel(d)} in ${d.jamaat?.name} (${d.jamiat?.name})`;

  // ---------- List ----------
  // ?deleted=true (Super Admin only) lists soft-deleted entries instead.
  router.get('/', async (req, res) => {
    const filter = await buildFilter(req);
    if (!filter) return res.status(400).json({ message: 'Invalid filters' });
    if (req.query.deleted === 'true') {
      if (req.user.role !== ROLES.SUPER_ADMIN) return res.status(403).json({ message: 'Forbidden' });
      delete filter.isDeleted;
      filter.isDeleted = true;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const sort = filter.isDeleted === true ? { deletedAt: -1 } : { [cfg.dateField]: -1, createdAt: -1 };

    const [items, total] = await Promise.all([
      cfg.Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate(POPULATE).lean(),
      cfg.Model.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) });
  });

  // ---------- Excel export: one sheet per Jamiat, every Jamaat listed ----------
  router.get('/export', adminOnly, async (req, res) => {
    const filter = await buildFilter(req);
    if (!filter) return res.status(400).json({ message: 'Invalid filters' });

    const items = await cfg.Model.find(filter).sort({ [cfg.dateField]: 1, createdAt: 1 }).populate(POPULATE).lean();
    const withEntries = new Set(items.map((i) => String(i.jamiat?._id)));
    const jamaatsWithEntries = new Set(items.map((i) => String(i.jamaat?._id)));

    // Jamiats: the filtered one, or every active Jamiat (+ inactive ones that have entries).
    const jamiats = (
      await Jamiat.find(req.query.jamiat ? { _id: req.query.jamiat } : {}).sort({ name: 1 }).lean()
    ).filter((j) => req.query.jamiat || j.isActive || withEntries.has(String(j._id)));

    const jamaatFilter = { jamiat: { $in: jamiats.map((j) => j._id) } };
    if (req.query.jamaat) jamaatFilter._id = req.query.jamaat;
    const jamaats = (await Jamaat.find(jamaatFilter).sort({ name: 1 }).lean()).filter(
      (j) => req.query.jamaat || j.isActive || jamaatsWithEntries.has(String(j._id))
    );

    const byJamaat = new Map();
    for (const it of items) {
      const k = String(it.jamaat?._id);
      if (!byJamaat.has(k)) byJamaat.set(k, []);
      byJamaat.get(k).push(it);
    }

    // Activity dropdown values: listed activities for this tab + new activities used in entries.
    const listed = await Activity.find({ [cfg.activityFlag]: true }).sort({ name: 1 }).lean();
    const custom = await cfg.Model.distinct('customActivity', { ...NOT_DELETED, customActivity: { $nin: ['', null] } });
    const activityNames = [...new Set([...listed.map((a) => a.name), ...custom.sort((a, b) => a.localeCompare(b))])];

    const wb = new ExcelJS.Workbook();
    const usedNames = new Set();
    const colLetter = (key) => String.fromCharCode(65 + cfg.columns.findIndex((c) => c.key === key));
    const actCol = colLetter('activity');
    const catCol = colLetter('category');

    for (const jamiat of jamiats) {
      let name = sheetSafe(jamiat.name);
      for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = sheetSafe(`${jamiat.name.slice(0, 27)} (${n})`);
      usedNames.add(name.toLowerCase());

      const ws = wb.addWorksheet(name);
      ws.columns = cfg.columns;
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      for (const jm of jamaats.filter((j) => String(j.jamiat) === String(jamiat._id))) {
        const entries = byJamaat.get(String(jm._id)) || [];
        if (entries.length === 0) ws.addRow({ jamaat: jm.name });
        else entries.forEach((e) => ws.addRow({ ...cfg.toRow(e), category: entryCategory(e), jamaat: jm.name }));
      }
      ws.eachRow((row) => (row.alignment = { vertical: 'top', wrapText: true }));
      // Excel filter arrows on the header (e.g. filter Category = Tibb).
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(ws.rowCount, 1), column: cfg.columns.length } };
      const lastRow = Math.max(ws.rowCount, 1) + 200;

      ws.dataValidations.add(`${catCol}2:${catCol}${lastRow}`, {
        type: 'list',
        allowBlank: true,
        formulae: [`"${CATEGORIES.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Category',
        error: `Choose ${CATEGORIES.join(', ')}`,
      });

      if (activityNames.length) {
        // Dropdown on the Activity column (with room to add rows). Other values are allowed after a warning.
        ws.dataValidations.add(`${actCol}2:${actCol}${lastRow}`, {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$A$1:$A$${activityNames.length}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Activity',
          error: 'This activity is not in the list. Keep it anyway?',
        });
      }
    }

    const lists = wb.addWorksheet('Lists', { state: 'hidden' });
    activityNames.forEach((n, i) => (lists.getCell(`A${i + 1}`).value = n));

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${cfg.exportName}_${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  // ---------- Create ----------
  router.post('/', jcOnly, async (req, res) => {
    const { doc, error, status } = await buildDoc(req);
    if (error) return res.status(status || 400).json({ message: error });
    const created = await saveWithDuplicateGuard(() => cfg.Model.create({ ...doc, createdBy: req.user._id }), res);
    if (!created) return;
    const item = await loadPopulated(created._id);
    await audit(req, { action: 'CREATE', entity: cfg.title, entityId: item._id, summary: `Added ${describe(item)}`, after: cfg.snapshot(item) });
    res.status(201).json({ item });
  });

  // ---------- Update (previous and new values kept in the audit log) ----------
  router.put('/:id', jcOnly, async (req, res) => {
    const existing = await findOwned(req);
    if (!existing) return res.status(404).json({ message: 'Entry not found' });
    const before = await loadPopulated(existing._id);

    const { doc, error, status } = await buildDoc(req, existing._id);
    if (error) return res.status(status || 400).json({ message: error });
    existing.set({ ...doc, updatedBy: req.user._id });
    if (!(await saveWithDuplicateGuard(() => existing.save(), res))) return;

    const item = await loadPopulated(existing._id);
    await audit(req, {
      action: 'UPDATE',
      entity: cfg.title,
      entityId: item._id,
      summary: `Edited ${describe(item)}`,
      before: cfg.snapshot(before),
      after: cfg.snapshot(item),
    });
    res.json({ item });
  });

  // ---------- Soft delete ----------
  router.delete('/:id', jcOnly, async (req, res) => {
    const existing = await findOwned(req);
    if (!existing) return res.status(404).json({ message: 'Entry not found' });
    const before = await loadPopulated(existing._id);

    existing.set({ isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id });
    await existing.save();
    await audit(req, { action: 'DELETE', entity: cfg.title, entityId: existing._id, summary: `Deleted ${describe(before)}`, before: cfg.snapshot(before) });
    res.json({ message: 'Deleted' });
  });

  // ---------- Restore (Super Admin) ----------
  router.post('/:id/restore', adminOnly, async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Entry not found' });
    const existing = await cfg.Model.findOne({ _id: req.params.id, isDeleted: true });
    if (!existing) return res.status(404).json({ message: 'Deleted entry not found' });

    if (existing.activityKey) {
      const dup = await findDuplicate(existing.jamaat, existing.activityKey, existing._id);
      if (dup) {
        return res.status(409).json({ message: `Cannot restore: ${duplicateMessage(dup).replace(' Edit that entry instead of adding a new one.', '')}` });
      }
    }

    existing.set({ isDeleted: false, deletedAt: null, deletedBy: null, updatedBy: req.user._id });
    if (!(await saveWithDuplicateGuard(() => existing.save(), res))) return;
    const item = await loadPopulated(existing._id);
    await audit(req, { action: 'RESTORE', entity: cfg.title, entityId: item._id, summary: `Restored ${describe(item)}`, after: cfg.snapshot(item) });
    res.json({ item });
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
