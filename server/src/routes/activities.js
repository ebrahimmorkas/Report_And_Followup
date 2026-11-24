import { Router } from 'express';
import Activity, { CATEGORIES } from '../models/Activity.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import { isValidId } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { buildWorkbook, rawExcel, readUpload, sendWorkbook, yesNo as yesNoCell } from '../utils/bulkExcel.js';

const router = Router();
const adminOnly = requireRole(ROLES.SUPER_ADMIN);

// ?type=report|followup filters to activities shown in that tab.
// Non-admins only ever see active activities; admins can pass ?active=true.
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.type === 'report') filter.showInReport = true;
  if (req.query.type === 'followup') filter.showInFollowUp = true;
  if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  if (req.user.role !== ROLES.SUPER_ADMIN || req.query.active === 'true') filter.isActive = true;
  const activities = await Activity.find(filter).sort({ name: 1 }).lean();
  res.json({ activities, categories: CATEGORIES });
});

function readBody(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const showInReport = Boolean(body.showInReport);
  const showInFollowUp = Boolean(body.showInFollowUp);
  if (!name) return { error: 'Activity name is required' };
  if (!CATEGORIES.includes(body.category)) return { error: `Select a category (${CATEGORIES.join(', ')})` };
  if (!showInReport && !showInFollowUp) return { error: 'Select Report, Follow-up, or both' };
  const data = { name, category: body.category, showInReport, showInFollowUp };
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  return { data };
}

const yesNo = (v) => (v ? 'Yes' : 'No');
const snap = (a) => ({ Name: a.name, Category: a.category || '', Report: yesNo(a.showInReport), 'Follow-up': yesNo(a.showInFollowUp), Active: yesNo(a.isActive) });

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

// ---------- Bulk upload (Excel): Name | Category | Report | Follow-up ----------
// Bad rows never stop the upload; they are returned at the end with the reason.

const ACTIVITY_COLUMNS = {
  name: ['Name', 'Activity', 'Activity Name'],
  category: ['Category'],
  report: ['Report', 'Show in Report'],
  followUp: ['Follow-up', 'Follow up', 'Followup', 'Show in Follow-up'],
};
const ACTIVITY_HEADERS = ['Name', 'Category', 'Report', 'Follow-up'];
const ACTIVITY_DROPDOWNS = [
  { col: 'B', list: `"${CATEGORIES.join(',')}"`, error: `Choose ${CATEGORIES.join(', ')}` },
  { col: 'C', list: '"Yes,No"', error: 'Choose Yes or No' },
  { col: 'D', list: '"Yes,No"', error: 'Choose Yes or No' },
];

/**
 * Upload format: sheet 1 "Activities" is blank (headers + dropdowns) and is the sheet that gets uploaded.
 * Sheet 2 "Example & Instructions" shows filled-in sample rows and the rules; it is never imported.
 */
export function buildActivityTemplate() {
  return buildWorkbook({
    sheetName: 'Activities',
    headers: ACTIVITY_HEADERS,
    widths: [36, 14, 10, 12],
    validations: ACTIVITY_DROPDOWNS,
    extra: [
      {
        name: 'Example & Instructions',
        widths: [36, 14, 10, 12],
        boldRows: [1, 3, 10],
        rows: [
          ['EXAMPLE (fill your activities in the "Activities" sheet, not here)'],
          [],
          ACTIVITY_HEADERS,
          ['Marathon', 'Riyadah', 'Yes', 'Yes'],
          ['Cleanliness Drive', 'Nazafat', 'Yes', 'No'],
          ['Eye Camp', 'Tibb', 'No', 'Yes'],
          ['World Diabetes Day', 'Tibb', 'Yes', 'Yes'],
          [],
          [],
          ['RULES'],
          ['Name: activity name (required, must not already exist).'],
          [`Category: ${CATEGORIES.join(', ')}.`],
          ['Report: Yes = shown in the Report tab, No = not shown.'],
          ['Follow-up: Yes = shown in the Follow-up tab, No = not shown.'],
          ['At least one of Report / Follow-up must be Yes.'],
          ['Only the first sheet ("Activities") is uploaded. Rows with mistakes are skipped and listed after upload.'],
        ],
      },
    ],
  });
}

router.get('/bulk/template', adminOnly, async (req, res) => {
  sendWorkbook(res, await buildActivityTemplate(), 'Activities_upload_format.xlsx');
});

router.post('/bulk', adminOnly, rawExcel, async (req, res) => {
  const { rows, error } = await readUpload(req.body, ACTIVITY_COLUMNS);
  if (error) return res.status(400).json({ message: error });

  const existing = new Set((await Activity.find().select('name').lean()).map((a) => a.name.toLowerCase()));
  const seen = new Map(); // lowercase name -> row number in this file
  const created = [];
  const failed = [];

  for (const { rowNumber, values } of rows) {
    const fail = (reason) => failed.push({ row: rowNumber, ...values, reason });
    const name = values.name.replace(/\s+/g, ' ');
    if (!name) { fail('Name is missing'); continue; }
    if (name.length > 100) { fail('Name is too long (max 100 characters)'); continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) { fail(`Same activity as row ${seen.get(key)}`); continue; }
    if (existing.has(key)) { fail('This activity already exists'); continue; }

    const category = CATEGORIES.find((c) => c.toLowerCase() === values.category.toLowerCase());
    if (!category) { fail(values.category ? `Unknown category "${values.category}" (use ${CATEGORIES.join(', ')})` : 'Category is missing'); continue; }

    const showInReport = yesNoCell(values.report);
    const showInFollowUp = yesNoCell(values.followUp);
    if (showInReport === null) { fail('Report must be Yes or No'); continue; }
    if (showInFollowUp === null) { fail('Follow-up must be Yes or No'); continue; }
    if (!showInReport && !showInFollowUp) { fail('Report or Follow-up (or both) must be Yes'); continue; }

    try {
      const activity = await Activity.create({ name, category, showInReport, showInFollowUp });
      existing.add(key);
      seen.set(key, rowNumber);
      await audit(req, { action: 'CREATE', entity: 'Activity', entityId: activity._id, summary: `Added activity ${name} (Excel upload)`, after: snap(activity) });
      created.push({ row: rowNumber, name, category, report: yesNo(showInReport), followUp: yesNo(showInFollowUp) });
    } catch (e) {
      fail(e.code === 11000 ? 'This activity already exists' : 'Could not save this row');
    }
  }

  const failedFile = failed.length
    ? (await buildWorkbook({
        sheetName: 'Activities',
        headers: [...ACTIVITY_HEADERS, 'Error'],
        widths: [36, 14, 10, 12, 50],
        rows: failed.map((f) => [f.name, f.category, f.report, f.followUp, `Row ${f.row}: ${f.reason}`]),
        validations: ACTIVITY_DROPDOWNS,
      })).toString('base64')
    : null;

  res.json({ total: rows.length, created, failed, failedFile });
});

export default router;
