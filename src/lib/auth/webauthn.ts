import 'server-only';
import { appUrl } from '@/lib/env';

export function rp() {
  const origin = appUrl();
  return {
    rpID: process.env.WEBAUTHN_RP_ID || new URL(origin).hostname,
    rpName: process.env.WEBAUTHN_RP_NAME || 'OrbitOS',
    origin,
  };
}

export const CHALLENGE_TTL_MS = 5 * 60_000;
