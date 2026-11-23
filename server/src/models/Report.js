import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const reportSchema = new mongoose.Schema(
  {
    jamiat: { type: ObjectId, ref: 'Jamiat', required: true, index: true },
    jamaat: { type: ObjectId, ref: 'Jamaat', required: true, index: true },
    activity: { type: ObjectId, ref: 'Activity', required: true, index: true },
    conductedDate: { type: Date, required: true, index: true },
    remarks: { type: String, trim: true, default: '' },
    extraActivities: [
      {
        _id: false,
        name: { type: String, required: true, trim: true },
        date: { type: Date, required: true },
      },
    ],
    createdBy: { type: ObjectId, ref: 'User', required: true },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Report', reportSchema);
