import FollowUp from '../models/FollowUp.js';
import { createEntryRouter, readExtras } from './entryRouter.js';
import { parseDateOnly, formatDate } from '../utils/dates.js';

function readText(body, key, label) {
  if (body[key] !== undefined && typeof body[key] !== 'string') return { error: `Invalid ${label.toLowerCase()}` };
  const value = (body[key] || '').trim();
  if (value.length > 2000) return { error: `${label} is too long (max 2000 characters)` };
  return { value };
}

function readPayload(body) {
  const plannedDate = parseDateOnly(body.plannedDate);
  if (!plannedDate) return { error: 'Enter the date on which it will be done' };

  const issues = readText(body, 'issues', 'Issues');
  if (issues.error) return issues;
  const description = readText(body, 'description', 'Description');
  if (description.error) return description;

  const { extras, error } = readExtras(body.extraActivities, (item, n) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return { error: `Extra activity #${n}: name is required` };
    return { value: { name } };
  });
  if (error) return { error };

  return { data: { plannedDate, issues: issues.value, description: description.value, extraActivities: extras } };
}

export default createEntryRouter({
  Model: FollowUp,
  title: 'Follow-up',
  activityFlag: 'showInFollowUp',
  dateField: 'plannedDate',
  readPayload,
  sheetName: 'Follow Up',
  columns: [
    { header: 'Jamiat', key: 'jamiat', width: 18 },
    { header: 'Jamaat', key: 'jamaat', width: 28 },
    { header: 'Activity', key: 'activity', width: 24 },
    { header: 'New Activity?', key: 'isNew', width: 13 },
    { header: 'In Place Of', key: 'inPlaceOf', width: 22 },
    { header: 'Planned Date', key: 'date', width: 15 },
    { header: 'Issues', key: 'issues', width: 40 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Extra Activities', key: 'extras', width: 40 },
    { header: 'Entered By', key: 'createdBy', width: 22 },
    { header: 'Entered On', key: 'createdAt', width: 15 },
  ],
  toRow: (d) => ({
    jamiat: d.jamiat?.name,
    jamaat: d.jamaat?.name,
    activity: d.customActivity || d.activity?.name,
    isNew: d.customActivity ? 'Yes' : '',
    inPlaceOf: d.inPlaceOf?.name || '',
    date: formatDate(d.plannedDate),
    issues: d.issues,
    description: d.description,
    extras: d.extraActivities.map((e) => e.name).join('\n'),
    createdBy: d.createdBy?.name,
    createdAt: formatDate(d.createdAt),
  }),
});
