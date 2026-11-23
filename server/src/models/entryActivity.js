import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Activity fields shared by Report and Follow-up.
 *
 * An entry is either:
 *  - a listed activity:   activity = <Activity id>
 *  - a new activity:      customActivity = 'Walkathon', optionally inPlaceOf = <Activity id> (e.g. done instead of ITNC)
 *
 * activityKey identifies "the same activity" for the duplicate rule
 * (one entry per Jamaat per activity, any date):
 *  - 'a:<activityId>'  for a listed activity, or a new activity done in place of that activity
 *  - 'c:<lowercase name>' for a new activity not mapped to any listed activity
 */
export const activityFields = {
  activity: { type: ObjectId, ref: 'Activity', default: null, index: true },
  customActivity: { type: String, trim: true, default: '' },
  inPlaceOf: { type: ObjectId, ref: 'Activity', default: null, index: true },
  activityKey: { type: String },
  // Soft delete: entries are never removed from the database.
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: ObjectId, ref: 'User', default: null },
};

/** Filter for entries that are not soft-deleted (older entries may lack the field). */
export const NOT_DELETED = { isDeleted: { $ne: true } };

/**
 * One live entry per Jamaat per activity. Deleted entries and older entries
 * without a key are not constrained.
 */
export function addDuplicateIndex(schema) {
  schema.index(
    { jamaat: 1, activityKey: 1 },
    {
      name: 'uniq_live_jamaat_activity',
      unique: true,
      partialFilterExpression: { activityKey: { $type: 'string' }, isDeleted: false },
    }
  );
}

/** Human-readable activity label, e.g. "ITNC" or "Walkathon (in place of ITNC)". */
export function activityLabel(doc) {
  if (!doc.customActivity) return doc.activity?.name || '';
  return doc.inPlaceOf?.name ? `${doc.customActivity} (in place of ${doc.inPlaceOf.name})` : doc.customActivity;
}

/**
 * Prepares entries created by older versions: sets isDeleted=false and the duplicate-rule key.
 * If an older entry duplicates another live one, it is kept unchanged but without a key.
 * Nothing is ever deleted.
 */
export async function backfillEntries(Model) {
  const docs = await Model.find({
    $or: [{ isDeleted: { $exists: false } }, { activityKey: { $exists: false }, activity: { $ne: null } }],
  })
    .select('_id activity activityKey isDeleted')
    .lean();

  let duplicates = 0;
  for (const d of docs) {
    const set = { isDeleted: d.isDeleted ?? false };
    if (!d.activityKey && d.activity) set.activityKey = `a:${d.activity}`;
    try {
      await Model.updateOne({ _id: d._id }, { $set: set });
    } catch (e) {
      if (e.code !== 11000) throw e;
      duplicates++;
      await Model.updateOne({ _id: d._id }, { $set: { isDeleted: set.isDeleted }, $unset: { activityKey: 1 } });
    }
  }
  if (duplicates) {
    console.warn(`! ${Model.modelName}: ${duplicates} older duplicate entr${duplicates === 1 ? 'y' : 'ies'} kept unchanged`);
  }
}
