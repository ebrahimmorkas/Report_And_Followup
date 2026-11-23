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
};

/** One entry per Jamaat per activity. Older entries without a key are not constrained. */
export function addDuplicateIndex(schema) {
  schema.index(
    { jamaat: 1, activityKey: 1 },
    { unique: true, partialFilterExpression: { activityKey: { $type: 'string' } } }
  );
}

/** Human-readable activity label, e.g. "ITNC" or "Walkathon (in place of ITNC)". */
export function activityLabel(doc) {
  if (!doc.customActivity) return doc.activity?.name || '';
  return doc.inPlaceOf?.name ? `${doc.customActivity} (in place of ${doc.inPlaceOf.name})` : doc.customActivity;
}

/**
 * Fills activityKey on entries created before the duplicate rule existed.
 * If an older entry duplicates another, it keeps no key (left as is, never deleted).
 */
export async function backfillActivityKeys(Model) {
  const docs = await Model.find({ activityKey: { $exists: false }, activity: { $ne: null } }).select('_id activity').lean();
  let skipped = 0;
  for (const d of docs) {
    try {
      await Model.updateOne({ _id: d._id }, { $set: { activityKey: `a:${d.activity}` } });
    } catch (e) {
      if (e.code === 11000) skipped++;
      else throw e;
    }
  }
  if (skipped) console.warn(`! ${Model.modelName}: ${skipped} older duplicate entr${skipped === 1 ? 'y' : 'ies'} left unchanged`);
}
