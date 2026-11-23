import Report from '../models/Report.js';
import { createEntryRouter, readExtras } from './entryRouter.js';
import { parseDateOnly, todayString, formatDate } from '../utils/dates.js';

function readPayload(body) {
  const conductedDate = parseDateOnly(body.conductedDate);
  if (!conductedDate) return { error: 'Enter the date the activity was conducted' };
  if (body.conductedDate > todayString()) return { error: 'Conducted date cannot be in the future' };

  if (body.remarks !== undefined && typeof body.remarks !== 'string') return { error: 'Invalid remarks' };
  const remarks = (body.remarks || '').trim();
  if (remarks.length > 2000) return { error: 'Remarks are too long (max 2000 characters)' };

  const { extras, error } = readExtras(body.extraActivities, (item, n) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return { error: `Extra activity #${n}: name is required` };
    const date = parseDateOnly(item.date);
    if (!date) return { error: `Extra activity #${n}: date is required` };
    if (item.date > todayString()) return { error: `Extra activity #${n}: date cannot be in the future` };
    return { value: { name, date } };
  });
  if (error) return { error };

  return { data: { conductedDate, remarks, extraActivities: extras } };
}

export default createEntryRouter({
  Model: Report,
  title: 'Report',
  activityFlag: 'showInReport',
  dateField: 'conductedDate',
  readPayload,
  sheetName: 'Report',
  columns: [
    { header: 'Jamiat', key: 'jamiat', width: 18 },
    { header: 'Jamaat', key: 'jamaat', width: 28 },
    { header: 'Activity', key: 'activity', width: 24 },
    { header: 'New Activity?', key: 'isNew', width: 13 },
    { header: 'In Place Of', key: 'inPlaceOf', width: 22 },
    { header: 'Conducted Date', key: 'date', width: 15 },
    { header: 'Extra Activities', key: 'extras', width: 40 },
    { header: 'Remarks', key: 'remarks', width: 40 },
    { header: 'Entered By', key: 'createdBy', width: 22 },
    { header: 'Entered On', key: 'createdAt', width: 15 },
  ],
  toRow: (d) => ({
    jamiat: d.jamiat?.name,
    jamaat: d.jamaat?.name,
    activity: d.customActivity || d.activity?.name,
    isNew: d.customActivity ? 'Yes' : '',
    inPlaceOf: d.inPlaceOf?.name || '',
    date: formatDate(d.conductedDate),
    extras: d.extraActivities.map((e) => `${e.name} (${formatDate(e.date)})`).join('\n'),
    remarks: d.remarks,
    createdBy: d.createdBy?.name,
    createdAt: formatDate(d.createdAt),
  }),
});
