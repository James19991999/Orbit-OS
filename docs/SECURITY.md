# Security: how OrbitOS is protected, and what you must do

No system online is unbreakable. The goal is to have no known holes, make attacks slow, expensive and visible, and make sure that if one account is broken into, the damage stays small. OrbitOS handles the code side. The checklist at the bottom covers your accounts, which matter just as much: most real break-ins happen through a founder's stolen password, not through the app's code.

## What's built into the app

| Threat | Protection | Tested by |
|---|---|---|
| One customer reading another's data | Row-level security in Postgres on every table: the database itself refuses, even if the app had a bug | `npm run test:db` (148 checks) |
| Stolen password | Two-factor (authenticator app or passkey), owners can require it for admins, inactivity timeout, sign-in alerts in the security log | `test:e2e:security` |
| Stolen password used to destroy documents | The document vault needs a two-factor session to open, add **or delete** files | `test:db` |
| Password guessing | Rate limits on every sign-in path, plus Supabase's own limits; failed sign-ins are logged and counted in the Founder Console | `test:e2e:attacks` |
| Another website acting as a signed-in visitor (CSRF) | Every change request must come from OrbitOS itself; others are refused before any code runs | `test:e2e:attacks` |
| Flooding the app with requests | 300 changes a minute per IP across the app, tighter limits per action (invites, payments, sign-in…), 1 MB maximum request size | `test:e2e:attacks` |
| Malicious file uploads | Supabase Storage enforces size (2 MB photos, 20 MB documents) and type (no web pages or scripts), whatever the browser claims | `test:db` |
| Fake payment notifications | Every IntaSend notification is re-checked directly with IntaSend before a plan changes; WhatsApp and GitHub messages must carry a valid signature | `test:e2e`, `test:e2e:features` |
| Script injection (XSS), clickjacking | React escaping, a strict Content Security Policy, no framing by other sites, COOP and other security headers | `test:e2e:attacks` |
| Error messages revealing internals | Server faults return a generic message; details go to the logs and Sentry only | `test:e2e:attacks` |
| Database tricks via search boxes | All queries are parameterised; email look-ups can't use wildcards | `test:e2e:attacks` |
| Secrets leaking | Server keys never reach the browser; calendar and eTIMS tokens are encrypted; `.env.local` is never committed | code review |
| Vulnerable packages | `npm audit` (0 known issues in shipped packages), Dependabot pull requests and GitHub CodeQL scanning on every push | `.github/workflows/security.yml` |
| Abuse of founder access | Founder Console needs `FOUNDER_EMAILS`, two-factor, and logs every visit | `test:e2e:founder` |

Researchers can report a problem through `/.well-known/security.txt`, which points to `NEXT_PUBLIC_CONTACT_EMAIL`.

## Your checklist (about one hour, once)

**1. Two-factor on every account that controls OrbitOS.** Use an authenticator app, not SMS.
- [ ] GitHub (Settings → Password and authentication)
- [ ] Vercel (Account Settings → Authentication)
- [ ] Supabase (Account → Security)
- [ ] IntaSend, Resend, Meta/WhatsApp, Google Cloud, Microsoft Entra, Anthropic, Sentry, Upstash
- [ ] The Gmail account those use for password resets
- [ ] OrbitOS itself (already required for the Founder Console)
- [ ] Store your recovery codes somewhere offline (printed, or a password manager), never in the repo

**2. GitHub** (the repository is public, so the code is visible; your keys must never be)
- [ ] Settings → Code security: turn on **Secret scanning** and **Push protection** (blocks a commit containing a key)
- [ ] Turn on **Dependabot alerts** and **Dependabot security updates**
- [ ] After pushing this update, check the **Security** workflow ran under Actions
- [ ] Settings → Branches: add a rule for `main` that blocks force-pushes and deletion

**3. Vercel**
- [ ] Settings → Deployment Protection: turn on **Vercel Authentication** for preview deployments, so only you can open them
- [ ] Mark `SUPABASE_SERVICE_ROLE_KEY`, `INTASEND_SECRET_KEY`, `ENCRYPTION_KEY`, `CRON_SECRET` and other secrets as **Sensitive**
- [ ] Add **Upstash** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, free) so rate limits hold across all of Vercel's servers. Without it each server counts separately
- [ ] Firewall: if you're ever under attack, turn on **Attack Challenge Mode** (one click) to make every visitor pass a browser check

**4. Supabase** (Authentication settings)
- [ ] Minimum password length **10** (matches the app), and require letters and digits
- [ ] **Leaked password protection** on (refuses passwords known from breaches; Pro plan)
- [ ] **Confirm email** on
- [ ] Optional, if bots start creating accounts: **CAPTCHA protection** (Cloudflare Turnstile). Tell me and I'll add the widget to the sign-in pages first, because turning it on alone would block sign-ins
- [ ] Database → Settings: **Enforce SSL**; Pro plan for daily backups (consider Point-in-Time Recovery once you have paying customers)
- [ ] Never share the service role key; if it's ever exposed, rotate it (Settings → API) and update Vercel

**5. Watch it**
- [ ] Open the Founder Console daily during the pilot: the **Sign-in attempts** tile turns red at 20 failed sign-ins in an hour
- [ ] Connect Sentry so you get an email when something breaks
- [ ] Every 3 months: rotate `CRON_SECRET` and the IntaSend keys, and review who has `FOUNDER_EMAILS` access

## If something happens

1. Turn on Vercel **Attack Challenge Mode** if the site is being flooded.
2. If a key may have leaked: rotate it at the provider, update it in Vercel, redeploy.
3. If an account was taken over: in Supabase → Authentication, sign that user out (or ban them), then reset their password.
4. The workspace **Security log** (Compliance) and `audit_log` show who did what and from which IP.
5. Under Kenya's Data Protection Act, a breach affecting personal data must be reported to the ODPC within 72 hours, and affected people informed. Write down what happened and when, as soon as you know.
