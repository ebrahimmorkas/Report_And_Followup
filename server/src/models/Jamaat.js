import mongoose from 'mongoose';

const jamaatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    jamiat: { type: mongoose.Schema.Types.ObjectId, ref: 'Jamiat', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

jamaatSchema.index({ jamiat: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Jamaat', jamaatSchema);
