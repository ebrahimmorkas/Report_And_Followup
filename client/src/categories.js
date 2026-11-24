/** Activity categories (same list as the server). */
export const CATEGORIES = ['Tibb', 'Riyadah', 'Nazafat', 'Project'];

export const CATEGORY_STYLE = {
  Tibb: 'bg-rose-50 text-rose-700',
  Riyadah: 'bg-sky-50 text-sky-700',
  Nazafat: 'bg-emerald-50 text-emerald-700',
  Project: 'bg-violet-50 text-violet-700',
};

/** Category of an entry: listed activity's category, or the one picked for a new activity. */
export const entryCategory = (item) =>
  item.customActivity ? item.customCategory || item.inPlaceOf?.category || '' : item.activity?.category || '';

/** Groups activities by category for <optgroup>s (uncategorised last). */
export function groupByCategory(activities) {
  const groups = CATEGORIES.map((c) => ({ category: c, items: activities.filter((a) => a.category === c) }));
  const rest = activities.filter((a) => !CATEGORIES.includes(a.category));
  if (rest.length) groups.push({ category: 'Uncategorised', items: rest });
  return groups.filter((g) => g.items.length);
}
