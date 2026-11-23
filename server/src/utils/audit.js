import AuditLog from '../models/AuditLog.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-by-field differences between two readable snapshots. */
export function diff(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  for (const field of keys) {
    const from = before?.[field] ?? null;
    const to = after?.[field] ?? null;
    if (!same(from, to)) changes.push({ field, from, to });
  }
  return changes;
}

/**
 * Records an audit entry. Never throws: a logging failure is reported to the console
 * but does not undo or block the user's action.
 *
 * @param {import('express').Request} req
 * @param {object} e
 * @param {string} e.action  CREATE | UPDATE | DELETE | RESTORE | TRANSFER | LOGIN | ...
 * @param {string} e.entity  Report | Follow-up | User | Jamiat | Jamaat | Activity | Auth
 * @param {*} [e.entityId]
 * @param {string} [e.summary]
 * @param {object} [e.before]  readable snapshot before the change
 * @param {object} [e.after]   readable snapshot after the change
 * @param {object} [e.actor]   defaults to req.user
 */
export async function audit(req, { action, entity, entityId = null, summary = '', before = null, after = null, actor }) {
  try {
    const who = actor === undefined ? req.user : actor;
    const changes = before && after ? diff(before, after) : [];
    if (action === 'UPDATE' && before && after && changes.length === 0) return; // nothing actually changed

    await AuditLog.create({
      actor: who?._id ?? null,
      actorName: who?.name ?? '',
      actorMobile: who?.mobile ?? '',
      action,
      entity,
      entityId,
      summary,
      before,
      after,
      changes,
      ip: req.ip || '',
      userAgent: String(req.get?.('user-agent') || '').slice(0, 300),
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
