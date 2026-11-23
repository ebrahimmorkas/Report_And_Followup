import mongoose from 'mongoose';
import { activityFields, addDuplicateIndex } from './entryActivity.js';

const { ObjectId } = mongoose.Schema.Types;

const followUpSchema = new mongoose.Schema(
  {
    jamiat: { type: ObjectId, ref: 'Jamiat', required: true, index: true },
    jamaat: { type: ObjectId, ref: 'Jamaat', required: true, index: true },
    ...activityFields,
    plannedDate: { type: Date, required: true, index: true },
    issues: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    extraActivities: [
      {
        _id: false,
        name: { type: String, required: true, trim: true },
      },
    ],
    createdBy: { type: ObjectId, ref: 'User', required: true },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

addDuplicateIndex(followUpSchema);

export default mongoose.model('FollowUp', followUpSchema);
