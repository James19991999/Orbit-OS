import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encrypts third-party credentials at rest (KRA eTIMS communication keys, calendar refresh tokens) with
 * AES-256-GCM. The key is ENCRYPTION_KEY: 32 random bytes as 64 hex characters or base64.
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Changing the key makes stored credentials unreadable: people would have to reconnect.
 */
function key(): Buffer | null {
  const raw = (process.env.ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

export const isEncryptionConfigured = () => key() !== null;

export class EncryptionNotConfigured extends Error {
  constructor() { super('ENCRYPTION_KEY is not set (64 hex characters). Ask whoever deploys OrbitOS to add it.'); }
}

/** "v1.<iv>.<tag>.<ciphertext>" in base64url. */
export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new EncryptionNotConfigured();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(box: string): string {
  const k = key();
  if (!k) throw new EncryptionNotConfigured();
  const [v, iv, tag, ct] = box.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unreadable stored secret');
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
