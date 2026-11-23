/** Differences between the Report and Follow-up tabs. */
export const KINDS = {
  report: {
    title: 'Report',
    subtitle: 'Activities that have already been conducted',
    endpoint: '/reports',
    activityType: 'report',
    dateField: 'conductedDate',
    dateLabel: 'Date conducted',
    textFields: [{ key: 'remarks', label: 'Remarks' }],
    extrasHaveDate: true,
    extrasHint: 'Other activities conducted along with this event',
    noFutureDate: true,
    exportName: 'Report.xlsx',
  },
  followup: {
    title: 'Follow-up',
    subtitle: 'Activities that will be conducted in the future',
    endpoint: '/followups',
    activityType: 'followup',
    dateField: 'plannedDate',
    dateLabel: 'Date on which it will be done',
    textFields: [
      { key: 'description', label: 'Description' },
      { key: 'issues', label: 'Issues' },
    ],
    extrasHaveDate: false,
    extrasHint: 'Extra activities that can be done with this event',
    noFutureDate: false,
    exportName: 'Follow_Up.xlsx',
  },
};
