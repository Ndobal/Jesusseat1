import { scrypt, randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const id = () => randomBytes(16).toString('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };
export function text(value, label, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function email(value) {
  const e = text(value, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400, 'Enter a valid email address.');
  return e;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 256) fail(400, 'Use a password of at least 12 characters (maximum 256 bytes).');
  return value;
}
export async function hashPassword(value) {
  const salt = secret();
  const hash = await derive(value, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(value, stored) {
  const [,salt,hash] = stored.split('$');
  const actual = await derive(value, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function encrypt(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(x => x.toString('base64url')).join('.');
}
export function decrypt(value, key) {
  const [iv,tag,body] = value.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  cipher.setAuthTag(tag); return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8');
}
export function rateLimit(db, key, limit, window = 15*60_000) {
  const now = Date.now();
  db.prepare(`INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END`).run(key,now+window,now,now);
  if (db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key).count > limit) fail(429,'Too many attempts. Please try again later.');
  db.prepare('DELETE FROM rate_limits WHERE reset_at<?').run(now-86400_000);
}
