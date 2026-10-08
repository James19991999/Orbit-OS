import type { Metadata } from 'next';
import { Prose } from '@/components/marketing/Prose';

export const metadata: Metadata = { title: 'Security overview' };

export default function Security() {
  return (
    <Prose title="Security overview">
      <p>A technical summary for security reviewers.</p>
      <h2>Architecture</h2>
      <ul><li>Next.js on Vercel; Supabase (Postgres, Auth, Storage, Realtime).</li><li>All traffic over HTTPS with HSTS; strict Content-Security-Policy, frame-ancestors none, no-sniff and a restrictive Permissions-Policy.</li><li>The service-role key is used only in server code after an explicit authentication and role check.</li></ul>
      <h2>Data protection</h2>
      <ul><li>Row-level security on every table; org IDs are immutable on every row (enforced by trigger).</li><li>Private storage buckets with per-workspace paths; the legal vault additionally requires an MFA-verified session.</li><li>Spreadsheet exports neutralise formula injection.</li></ul>
      <h2>Application security</h2>
      <ul><li>Input validation with zod on every API route; mass-assignment guards; rate limiting on authentication, payment and export routes.</li><li>Webhook verification: GitHub HMAC-SHA256, IntaSend challenge plus server-side status re-fetch.</li><li>Open-redirect protection on all post-login redirects.</li></ul>
      <h2>Reporting a vulnerability</h2>
      <p>Email security@your-domain with details and steps to reproduce. Please give us reasonable time to fix before disclosure.</p>
    </Prose>
  );
}
