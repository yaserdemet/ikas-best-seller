import crypto from 'node:crypto';
import { config } from './config.js';

const encKey = crypto.createHash('sha256').update('enc:' + config.appSecret).digest();
const signKey = crypto.createHash('sha256').update('sign:' + config.appSecret).digest();

/** ikas Client Secret'ı veritabanında AES-256-GCM ile şifreli tutar. */
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Panel oturumu için imzalı, süreli token. */
export function signSession(ttlHours = 24 * 7) {
  const exp = Date.now() + ttlHours * 3600 * 1000;
  const body = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', signKey).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', signKey).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function randomKey(prefix = 'ms') {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}
