import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'TRANSFER',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGE',
];

export const AUDIT_ENTITIES = ['Report', 'Follow-up', 'User', 'Jamiat', 'Jamaat', 'Activity', 'Auth'];

/**
 * Append-only record of who did what and when.
 * `before` / `after` are readable snapshots (names instead of ids); `changes` lists only the fields that differ.
 * Passwords are never stored.
 */
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    actor: { type: ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '' },
    actorMobile: { type: String, default: '' },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    entity: { type: String, enum: AUDIT_ENTITIES, required: true, index: true },
    entityId: { type: ObjectId, default: null, index: true },
    summary: { type: String, default: '' },
    before: { type: Mixed, default: null },
    after: { type: Mixed, default: null },
    changes: [{ _id: false, field: String, from: Mixed, to: Mixed }],
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { versionKey: false }
);

export default mongoose.model('AuditLog', auditLogSchema);
