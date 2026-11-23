import FollowUp from '../models/FollowUp.js';
import { createEntryRouter, readExtras } from './entryRouter.js';
import { parseDateOnly, formatDate } from '../utils/dates.js';

function readPayload(body) {
  const plannedDate = parseDateOnly(body.plannedDate);
  if (!plannedDate) return { error: 'Enter the date on which it will be done' };

  if (body.issues !== undefined && typeof body.issues !== 'string') return { error: 'Invalid issues' };
  const issues = (body.issues || '').trim();
  if (issues.length > 2000) return { error: 'Issues text is too long (max 2000 characters)' };

  const { extras, error } = readExtras(body.extraActivities, (item, n) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return { error: `Extra activity #${n}: name is required` };
    return { value: { name } };
  });
  if (error) return { error };

  return { data: { plannedDate, issues, extraActivities: extras } };
}

export default createEntryRouter({
  Model: FollowUp,
  activityFlag: 'showInFollowUp',
  dateField: 'plannedDate',
  readPayload,
  sheetName: 'Follow Up',
  columns: [
    { header: 'Jamiat', key: 'jamiat', width: 18 },
    { header: 'Jamaat', key: 'jamaat', width: 28 },
    { header: 'Activity', key: 'activity', width: 24 },
    { header: 'Planned Date', key: 'date', width: 15 },
    { header: 'Issues', key: 'issues', width: 40 },
    { header: 'Extra Activities', key: 'extras', width: 40 },
    { header: 'Entered By', key: 'createdBy', width: 22 },
    { header: 'Entered On', key: 'createdAt', width: 15 },
  ],
  toRow: (d) => ({
    jamiat: d.jamiat?.name,
    jamaat: d.jamaat?.name,
    activity: d.activity?.name,
    date: formatDate(d.plannedDate),
    issues: d.issues,
    extras: d.extraActivities.map((e) => e.name).join('\n'),
    createdBy: d.createdBy?.name,
    createdAt: formatDate(d.createdAt),
  }),
});
