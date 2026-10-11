import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Client components must not import the full dictionaries ('@/i18n'): every language would ship to every browser.
describe('i18n bundle hygiene', () => {
  it('client components import only @/i18n/client or @/i18n/shared', () => {
    const files = execSync("grep -rl \"from '@/i18n'\" src --include=*.tsx --include=*.ts || true", { encoding: 'utf8' }).split('\n').filter(Boolean);
    const offenders = files.filter((f) => /^['"]use client['"]/.test(readFileSync(f, 'utf8').trimStart()));
    expect(offenders).toEqual([]);
  });
});

describe('server-only keys', () => {
  it("client components never use 'p.', 'email.', 'wa.' or 'ai.r.' keys (they aren't sent to the browser)", () => {
    const files = execSync("grep -rlE \"t\\\\('(p|email|wa|ai\\\\.r)\\\\.\" src --include=*.tsx --include=*.ts || true", { encoding: 'utf8' }).split('\n').filter(Boolean);
    const offenders = files.filter((f) => /^['"]use client['"]/.test(readFileSync(f, 'utf8').trimStart()));
    expect(offenders).toEqual([]);
  });
});
