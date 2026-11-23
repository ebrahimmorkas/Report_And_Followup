import mongoose from 'mongoose';

/** Activity categories. */
export const CATEGORIES = ['Tibb', 'Riyadah', 'Nazafat'];

const activitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: [...CATEGORIES, null], default: null },
    showInReport: { type: Boolean, default: false },
    showInFollowUp: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

activitySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Activity', activitySchema);
