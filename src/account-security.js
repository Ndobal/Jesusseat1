import { audit, transaction } from './db.js';
import { digest, fail, hashPassword, password, rateLimit, verifyPassword } from './security.js';

const sessionId = row => digest(`revoke-session:${row.token_hash}`);

// These identifiers are deliberately different from both the bearer token and its stored digest.
export function listSessions(db, session) {
  return db.prepare('SELECT token_hash,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY expires_at DESC')
    .all(session.user_id, Date.now()).map(row => ({
      id: sessionId(row), current: row.token_hash === session.token_hash,
      startedAt: row.expires_at - 12 * 3600_000, expiresAt: row.expires_at
    }));
}

export function revokeSession(db, session, selectedId) {
  if (typeof selectedId !== 'string' || !/^[a-f0-9]{64}$/.test(selectedId)) fail(400, 'Choose a valid session.');
  return transaction(db, () => {
    const selected = db.prepare('SELECT token_hash FROM sessions WHERE user_id=? AND expires_at>?')
      .all(session.user_id, Date.now()).find(row => sessionId(row) === selectedId);
    if (!selected) fail(404, 'Session not found.');
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash=?').run(session.user_id, selected.token_hash);
    audit(db, null, session.user_id, 'account.session_revoke', selectedId);
    return selected.token_hash === session.token_hash;
  });
}

export function revokeOtherSessions(db, session) {
  return transaction(db, () => {
    const result = db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(session.user_id, session.token_hash);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(session.user_id);
    audit(db, null, session.user_id, 'account.other_sessions_revoke', session.user_id, { count: Number(result.changes) });
    return Number(result.changes);
  });
}

export async function changePassword(db, session, body, sessionFor, queueMail) {
  rateLimit(db, `change-password:${session.user_id}`, 5, 3600_000);
  if (typeof body.currentPassword !== 'string' || !body.currentPassword.length || Buffer.byteLength(body.currentPassword) > 256) fail(400, 'Enter your current password.');
  const next = password(body.password);
  if (next === body.currentPassword) fail(400, 'Choose a password different from your current password.');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
  if (!await verifyPassword(body.currentPassword, user.password_hash)) fail(403, 'Your current password is incorrect.');
  const hash = await hashPassword(next);
  return transaction(db, () => {
    // Password hashing yields to other requests. Recheck the session and credential before writing.
    const current = db.prepare('SELECT password_hash FROM users WHERE id=?').get(session.user_id);
    const stillSignedIn = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(session.token_hash, Date.now());
    if (!stillSignedIn || current.password_hash !== user.password_hash) fail(409, 'Your account security changed. Sign in again before retrying.');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
    db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=\'reset\'').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM mfa_enrollments WHERE user_id=?').run(user.id);
    const fresh = sessionFor(user);
    audit(db, null, user.id, 'account.password_change', user.id);
    queueMail(user.email, 'Your JesusSeat password was changed',
      `Hello ${user.name},\n\nYour password was changed from an authenticated JesusSeat session. Other sessions have been signed out. If you did not make this change, use password recovery immediately and contact your church administrator.\n\nJesusSeat — an evangelical product of Ndovera Limited.`);
    return fresh;
  });
}
