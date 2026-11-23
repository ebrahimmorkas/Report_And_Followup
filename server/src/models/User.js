import mongoose from 'mongoose';

export const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', JC: 'JC' };

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, match: /^\d{10}$/ },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.JC },
    jamiats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Jamiat' }],
    isActive: { type: Boolean, default: true },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
