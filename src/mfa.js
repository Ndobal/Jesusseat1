import { randomBytes } from 'node:crypto';
import { audit, transaction } from './db.js';
import { digest, encrypt, decrypt, fail, secret, rateLimit, verifyPassword } from './security.js';
import { newTotpSecret, matchTotp } from './totp.js';

const recoveryDigest = (userId, code) => digest(`recovery:${userId}:${code.replace(/[\s-]/g, '').toLowerCase()}`);

export function createMfa({ db, key, origin, production, sessionFor, queueMail }) {
  const cookieName = production ? '__Host-jesusseat-mfa' : 'jesusseat-mfa';
  const cookie = (value, seconds) => `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${production ? '; Secure' : ''}`;
  const clearCookie = () => cookie('', 0);
  function challengeFor(req) {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const row = token && db.prepare('SELECT * FROM mfa_challenges WHERE token_hash=? AND expires_at>? AND attempts<5').get(digest(token), Date.now());
    if (!row) fail(401, 'Your sign-in check expired. Sign in with your password again.');
    return row;
  }
  function recoveryCodes(userId) {
    db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(userId);
    const codes = Array.from({ length: 10 }, () => randomBytes(12).toString('hex').match(/.{6}/g).join('-'));
    for (const code of codes) db.prepare('INSERT INTO recovery_codes(user_id,code_hash) VALUES(?,?)').run(userId, recoveryDigest(userId, code));
    return codes;
  }
  function factor(userId, code, onlyTotp = false) {
    const row = db.prepare('SELECT * FROM account_mfa WHERE user_id=?').get(userId);
    if (!row || typeof code !== 'string' || code.length > 100) return false;
    const step = matchTotp(decrypt(row.secret_cipher, key), code.trim(), row.last_step);
    if (step !== null) {
      db.prepare('UPDATE account_mfa SET last_step=? WHERE user_id=?').run(step, userId);
      return true;
    }
    if (onlyTotp || !/^[a-f0-9]{24}$/.test(code.replace(/[\s-]/g, '').toLowerCase())) return false;
    return db.prepare('DELETE FROM recovery_codes WHERE user_id=? AND code_hash=?').run(userId, recoveryDigest(userId, code)).changes === 1;
  }
  async function checkPassword(session, password) {
    rateLimit(db, `mfa-password:${session.user_id}`, 8, 3600_000);
    if (typeof password !== 'string' || !password.length || Buffer.byteLength(password) > 256) fail(400, 'Enter your current password.');
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
    if (!await verifyPassword(password, user.password_hash)) fail(403, 'Your current password is incorrect.');
    return user;
  }
  function recheck(session, user) {
    const valid = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(session.token_hash, Date.now());
    if (!valid || db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash !== user.password_hash) fail(409, 'Your account security changed. Sign in again.');
  }
  function rotate(user) {
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=\'reset\'').run(user.id);
    return sessionFor(user);
  }
  function notify(user, action) {
    queueMail(user.email, 'Your JesusSeat two-step verification changed',
      `Hello ${user.name},\n\n${action}\nIf you did not make this change, secure your account and contact support.\n${origin}/security\n\nJesusSeat — an evangelical product of Ndovera Limited.`);
  }
  return {
    startLogin(user) {
      const token = secret(), csrf = secret();
      db.prepare('DELETE FROM mfa_challenges WHERE expires_at<=? OR attempts>=5').run(Date.now());
      db.prepare('DELETE FROM mfa_enrollments WHERE expires_at<=?').run(Date.now());
      db.prepare('INSERT INTO mfa_challenges VALUES(?,?,?,?,?,0)').run(digest(token), user.id, csrf, Date.now() + 5 * 60_000, digest(user.password_hash));
      audit(db, null, user.id, 'account.password_verified', user.id);
      return { csrf, cookie: cookie(token, 300), mfaRequired: true };
    },
    challenge(req) { const c = challengeFor(req); return { csrf: c.csrf }; },
    completeLogin(req, code) {
      rateLimit(db, `mfa-login:${digest(req.ip || 'unknown')}`, 30);
      const c = challengeFor(req);
      if (req.headers['x-csrf-token'] !== c.csrf) fail(403, 'Refresh the verification page and try again.');
      const result = transaction(db, () => {
        const current = db.prepare('SELECT * FROM mfa_challenges WHERE token_hash=? AND expires_at>? AND attempts<5').get(c.token_hash, Date.now());
        if (!current) return null;
        const user = db.prepare('SELECT * FROM users WHERE id=?').get(current.user_id);
        if (digest(user.password_hash) !== current.password_version) { db.prepare('DELETE FROM mfa_challenges WHERE token_hash=?').run(current.token_hash); return null; }
        // Commit unsuccessful attempt counters; throwing here would roll them back.
        db.prepare('UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=?').run(c.token_hash);
        if (!factor(user.id, code)) return null;
        db.prepare('DELETE FROM mfa_challenges WHERE token_hash=?').run(c.token_hash);
        audit(db, null, user.id, 'account.login', user.id, { secondFactor: true });
        return sessionFor(user);
      });
      if (!result) fail(401, 'Code invalid, already used or expired. Try a fresh code or a recovery code.');
      return { csrf: result.csrf, cookies: [result.cookie, clearCookie()] };
    },
    status(session) {
      const row = db.prepare('SELECT enabled_at FROM account_mfa WHERE user_id=?').get(session.user_id);
      return { enabled: !!row, enabledAt: row?.enabled_at || null,
        recoveryCodesRemaining: db.prepare('SELECT count(*) n FROM recovery_codes WHERE user_id=?').get(session.user_id).n };
    },
    async begin(session, password) {
      const user = await checkPassword(session, password), seed = newTotpSecret();
      transaction(db, () => {
        recheck(session, user);
        if (db.prepare('SELECT user_id FROM account_mfa WHERE user_id=?').get(user.id)) fail(409, 'Two-step verification is already enabled.');
        db.prepare('DELETE FROM mfa_enrollments WHERE expires_at<=?').run(Date.now());
        db.prepare('INSERT OR REPLACE INTO mfa_enrollments VALUES(?,?,?,?)').run(user.id, encrypt(seed, key), session.token_hash, Date.now() + 10 * 60_000);
        audit(db, null, user.id, 'account.mfa_setup_started', user.id);
      });
      // Returned only to this authenticated session. Never call an external QR-code service.
      return { secret: seed, issuer: 'JesusSeat', account: user.email, algorithm: 'SHA1', digits: 6, period: 30 };
    },
    confirm(session, code) {
      rateLimit(db, `mfa-enroll:${session.user_id}`, 8);
      return transaction(db, () => {
        const pending = db.prepare('SELECT * FROM mfa_enrollments WHERE user_id=? AND session_hash=? AND expires_at>?').get(session.user_id, session.token_hash, Date.now());
        if (!pending) fail(400, 'Setup has expired. Start again from this session.');
        if (db.prepare('SELECT user_id FROM account_mfa WHERE user_id=?').get(session.user_id)) fail(409, 'Two-step verification is already enabled.');
        const step = matchTotp(decrypt(pending.secret_cipher, key), typeof code === 'string' ? code.trim() : code);
        if (step === null) fail(400, 'Enter the current six-digit code from your authenticator.');
        const user = db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
        db.prepare('INSERT INTO account_mfa VALUES(?,?,?,?)').run(user.id, pending.secret_cipher, Date.now(), step);
        db.prepare('DELETE FROM mfa_enrollments WHERE user_id=?').run(user.id);
        const codes = recoveryCodes(user.id), fresh = rotate(user);
        audit(db, null, user.id, 'account.mfa_enabled', user.id); notify(user, 'Two-step verification is now enabled. Other sessions were signed out.');
        return { codes, csrf: fresh.csrf, cookie: fresh.cookie };
      });
    },
    async modify(session, body, action) {
      const user = await checkPassword(session, body.currentPassword);
      rateLimit(db, `mfa-change:${session.user_id}`, 8);
      return transaction(db, () => {
        recheck(session, user);
        if (!factor(user.id, body.code)) fail(403, 'Enter a fresh authenticator code or an unused recovery code.');
        let codes;
        if (action === 'disable') {
          db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(user.id);
          db.prepare('DELETE FROM account_mfa WHERE user_id=?').run(user.id);
          db.prepare('DELETE FROM mfa_enrollments WHERE user_id=?').run(user.id);
        } else codes = recoveryCodes(user.id);
        const fresh = rotate(user);
        audit(db, null, user.id, action === 'disable' ? 'account.mfa_disabled' : 'account.recovery_codes_replaced', user.id);
        notify(user, action === 'disable' ? 'Two-step verification was disabled.' : 'Your recovery codes were replaced. Previous codes no longer work.');
        return { codes, csrf: fresh.csrf, cookie: fresh.cookie };
      });
    }
  };
}
