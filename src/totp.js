import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function decodeBase32(input) {
  if (typeof input !== 'string' || !/^[A-Z2-7]+=*$/.test(input)) throw new Error('Invalid base32 secret');
  let bits = 0, value = 0; const result = [];
  for (const char of input.replace(/=+$/, '')) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; result.push((value >>> bits) & 255); }
  }
  return Buffer.from(result);
}
export const newTotpSecret = () => encodeBase32(randomBytes(20));

// RFC 4226 dynamic truncation and RFC 6238's 30-second moving counter.
export function hotp(seed, step, digits = 6) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', decodeBase32(seed)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, '0');
}
export const totp = (seed, now = Date.now(), digits = 6) => hotp(seed, Math.floor(now / 30_000), digits);

export function matchTotp(seed, code, lastStep = -1, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const candidate of [step, step - 1, step + 1]) {
    if (candidate <= lastStep || candidate < 0) continue;
    if (timingSafeEqual(Buffer.from(hotp(seed, candidate)), Buffer.from(code))) return candidate;
  }
  return null;
}
