# OrbitOS

**The distributed operating system for remote-first companies.** One calm cockpit for founders and operations leaders: company health, sprints, runway, time-zone scheduling, culture, compliance and board reports — across every city the team works from.

Built from the *Distributed Executive OS* Stitch export (`design-reference/`). Stack: **Next.js 15.5 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Auth, Postgres + RLS, Storage, Realtime) · IntaSend (M-Pesa + card) · Resend · Vercel**. No Stripe anywhere.

---

## Contents
1. [What's in the box](#whats-in-the-box)
2. [Setup (production)](#setup-production)
3. [Local development & the full test stack](#local-development--the-full-test-stack)
4. [Architecture](#architecture)
5. [Roles & permissions](#roles--permissions)
6. [Payments (IntaSend)](#payments-intasend)
7. [Verification status — what is proven, and what isn't](#verification-status)
8. [Deliberate deviations from the build prompt](#deliberate-deviations-from-the-build-prompt)
9. [Roadmap / not built](#roadmap--not-built)

---

## What's in the box

| Area | What it does (all backed by real data — nothing hard-coded) |
|---|---|
| **Dashboard** | Company Health Index (documented formula, 4 pillars), urgent actions computed from blocked/overdue tasks, failing controls, DSAR deadlines, invoices due, cost variance and pending approvals; distributed pulse; executive shortcuts |
| **Operations** | Sprints + Kanban (drag-and-drop *and* per-card status menu for keyboard/touch), task detail; cash, burn, runway, net cash flow, 6-month chart; two-person expense approvals; recorded payroll (+ CSV import); client invoices paid by IntaSend link; realtime team activity (incl. GitHub PRs) |
| **Scheduling** | Live team matrix by hub, **computed golden-overlap window** (DST- and date-line-correct), deterministic slot finder, cognitive load, meetings with Jitsi video links, `.ics` invites, RSVPs |
| **Culture** | Lounges with Realtime Presence and a **shared, server-anchored focus timer**, pulse/announcement/eNPS polls with truly anonymous votes, async roll call, channels with threads/pinning/typing indicator, kudos with badges and reactions |
| **Compliance** | SOC 2 / GDPR / ISO 27001 / HIPAA starter control sets, owners, statuses, evidence uploads, DSAR tracker, device fleet (+ CSV), security-awareness campaigns with rate-limited reminders, MFA-gated legal vault, security log, **audit-ready ZIP** (summary PDF + CSVs + evidence) |
| **Reports** | Velocity index, sync load and cost, async rate, 4 domain modules, rule-based chrono-optimizer (suggest → confirm → move meeting), PDF/CSV export, Slack dispatch, scheduled email/Slack digests |
| **People** | Directory with live local times, working status, filters, member detail |
| **Settings** | Org & legal entities, SSO/MFA/session policy, Slack + GitHub integrations, timezone engine, RBAC & invites, billing, data residency, full tenant archive, offboarding with 30-day deletion |
| **Auth** | Email/password, Google Workspace, Microsoft Entra ID, SAML SSO (per-workspace domain), **passkeys (WebAuthn)**, TOTP two-factor, remember-device, inactivity timeout, invites, onboarding |
| **Platform** | Notifications (realtime bell), append-only audit log with CSV export, light/dark/system themes, marketing site, legal pages, SEO (sitemap, robots, OG image) |

---

## Setup (production)

### 1. Supabase
1. Create a project (Pro plan if you need SAML SSO).
2. Link and push the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations/*
   ```
   Do **not** run `supabase/seed.sql` in production — it is demo data.
3. **Auth → URL configuration:** Site URL = your app URL; add `https://<your-app>/auth/callback` to redirect URLs.
4. **Auth → Providers:** enable Email; optionally Google and Azure (Entra ID, scope `email`). For SAML:
   `supabase sso add --type saml --project-ref <ref> --metadata-url <IdP metadata> --domains company.com`, then save the domain in **Settings → Authentication & identity**.
5. **Auth → MFA:** TOTP enabled (on by default).
6. Storage buckets (`avatars`, `evidence`, `vault`, `exports`) and their policies are created by migration `…0004_storage.sql`.
7. Realtime: migrations add the needed tables to the `supabase_realtime` publication.

### 2. IntaSend
1. Get publishable + secret keys (start with **sandbox**, `INTASEND_TEST_MODE=true`).
2. Dashboard → Webhooks: URL `https://<your-app>/api/webhooks/intasend`, and set a **challenge** string → `INTASEND_WEBHOOK_CHALLENGE`.
3. Before going live, re-check the endpoint shapes in `src/lib/intasend/client.ts` against https://developers.intasend.com.

### 3. Resend (email)
Verify your sending domain and set `RESEND_API_KEY` + `EMAIL_FROM`. Without it, the app still works: invites show a copyable link and every email-dependent action reports "email not configured" instead of pretending.

### 4. Vercel
1. Import the repo, set the env vars from `.env.example`, deploy.
2. Crons are in `vercel.json` (digests and renewal reminders run **hourly**; health snapshot and retention daily). Set `CRON_SECRET`; Vercel sends it automatically. *Vercel's Hobby plan has historically limited cron jobs to once a day — check your plan; on Hobby, hourly jobs will not run as scheduled.*
3. Optional: `NEXT_PUBLIC_ROOT_DOMAIN=orbitos.io` + a `*.orbitos.io` wildcard domain for subdomain tenancy (`acme.orbitos.io`). Without it, tenancy uses the workspace switcher + a cookie.
4. Optional: `UPSTASH_REDIS_REST_URL/TOKEN` for distributed rate limiting (in-memory otherwise).

### Environment variables
See `.env.example`. **Only the three Supabase variables are required** — the app builds and boots with none at all (public pages render and the app shows a setup notice), and every optional integration degrades to a labelled "not configured" state.

---

## Local development & the full test stack

```bash
npm install
npm run dev
```

### Test commands
| Command | What it runs |
|---|---|
| `npm run typecheck` / `npm run lint` | TypeScript strict, ESLint (next/core-web-vitals) |
| `npm test` | **102 Jest tests**: scheduling (DST, date line, weekends), health/finance/sprint/people metrics, pricing, phone normalisation, `.ics`, PDF/CSV (formula-injection), GitHub HMAC, session rules, open-redirect guard, IntaSend webhook + checkout + renewals-cron **route handlers** (incl. failure paths), and component tests (login paths, poll rollback, roll call, sign-out failure, clipboard failure, jest-axe) |
| `npm run test:db` | **71 SQL tests** against a real Postgres: migrations + seed + RLS (cross-tenant isolation, role escalation, client-unwritable billing/audit/plan columns, anonymous votes, expired-workspace read-only, MFA-gated vault, payment idempotency, two-person expense rule) |
| `npm run stack:up` | Boots a **local Supabase-compatible stack**: Postgres + real **GoTrue** (Supabase Auth) + real **PostgREST** + a gateway on `:54321`, plus an **IntaSend mock** on `:54400`; applies migrations + seed and writes `.env.local` |
| `npm run test:e2e` | **25 end-to-end business flows** in real Chromium against that stack (see below) |
| `npm run test:e2e:security` | **19 end-to-end auth/session flows**: passkeys via Chrome's virtual WebAuthn authenticator, TOTP with real codes, enforced 2FA, MFA-gated archive/offboarding, remember-device cookie lifetimes, inactivity timeout, workspace switching, expired-workspace read-only. Run after `test:e2e` on the same database |
| `npm run test:a11y` | **axe-core in real Chromium** over 27 pages × (dark, light, 375 px mobile) incl. signed-in app pages; also fails on horizontal overflow |

`stack:up` needs a running Postgres 15/16 (`PGHOST/PGPORT`) and the `postgrest` + Supabase `auth` binaries (from their GitHub releases) in `$BIN`. Demo login: `elena@acme-global.demo` / `OrbitOS-demo-2026` (owner); also `devon@…` (director), `meiling@…` (contributor), `priya@…` (auditor).

---

## Architecture

```
src/
  app/(marketing)/   landing, pricing, legal, trust, security, pay/complete
  app/(auth)/        login, signup, forgot/reset password, join/[code]
  app/(setup)/       onboarding, mfa
  app/(app)/         dashboard, operations, scheduling, culture, compliance, reports, people, settings, profile, notifications
  app/api/           36 route handlers (billing, webhooks, crons, exports, integrations, members, passkeys…)
  components/        ui kit + one folder per module
  lib/               pure, unit-tested logic (scheduling, metrics, billing, ics, pdf) + server helpers
  middleware.ts      session refresh, protected-route redirects, inactivity timeout, subdomain tenancy
supabase/
  migrations/        schema, RLS, functions/triggers, storage, activity stream
  seed.sql           dev-only demo workspace
  tests/             RLS test suite + runner
scripts/             local stack, IntaSend mock, e2e flows, a11y check
```

**Security model.** Postgres RLS is the boundary; middleware only redirects. Helper functions (`is_org_member`, `has_org_role`, `can_write`) are `SECURITY DEFINER` so policies never recurse. `org_id` is immutable on every tenant row (trigger, even for the service role). Billing records, audit log, notifications, activity and plan/seat/status/SSO columns have **no client write path** — they change only through server routes (after an explicit auth + role check) or atomic RPCs (`create_organization`, `redeem_invite`, `apply_intasend_payment`, `apply_invoice_payment`). Every API route: auth → membership + role → zod (strict, no mass assignment) → rate limit → action → audit.

**Things that are deliberately *not* trusted:** client-sent prices (computed server-side from `src/lib/billing/plans.ts`), webhook payload states (re-fetched from IntaSend), post-login redirect targets (same-origin only), expense approval status (forced to `pending` above the threshold by trigger; creators can't approve their own).

---

## Roles & permissions

| | Owner | Director | Contributor | Auditor |
|---|:-:|:-:|:-:|:-:|
| Dashboard, scheduling, culture | ✓ | ✓ | ✓ | read |
| Tasks | all | all | own/assigned | read |
| Finance ledger, invoices, payroll | ✓ | ✓ | summary only | read |
| Approve expenses (not own) | ✓ | ✓ | — | — |
| Compliance controls & evidence | ✓ | ✓ | read | read |
| Legal vault (+ MFA session) | ✓ | ✓ | — | — |
| Reports & exports, audit log | ✓ | ✓ | — | ✓ |
| Invite members | ✓ | contributors/auditors | — | — |
| Roles, SSO/MFA policy, billing, archive, offboarding | ✓ | — | — | billing read |

---

## Payments (IntaSend)

* **Platform plans** (`/settings/billing`, owner-only): M-Pesa STK push (KES) or hosted card checkout (workspace currency). One-time payment per month/year — **no auto-renewal** (M-Pesa can't be charged silently). Reminders at T-7/T-3/T-0, 3-day grace, then read-only (never deleted).
* **STK polling is bounded to 90 s**, then the page says "still waiting" and the webhook settles it.
* **Client invoices**: "Send invoice" creates an IntaSend checkout link and emails it; the webhook marks the invoice paid and books revenue. Manual "mark paid" exists for bank transfers.
* **Webhook security**: constant-time challenge check → **status re-fetched from IntaSend with the secret key** → `api_ref` must match → idempotent RPC. The challenge scheme alone is weaker than HMAC signing; the re-fetch is what makes it safe.
* Pricing lives in **`src/lib/billing/plans.ts`** (minor units). Edit there only.

---

## Verification status

**Proven in this build environment**
* TypeScript strict: 0 errors · ESLint: 0 warnings · production build: 72 routes (36 pages, 36 API).
* **102/102 Jest**, **71/71 SQL RLS tests on real Postgres 16**.
* **25/25 end-to-end flows in real Chromium** against real Supabase Auth (GoTrue v2.170) + real PostgREST (v12.2) + Postgres, including: password sign-in; task create/move; expense forced to pending + two-person approval; check-in; poll; kudos; meeting scheduling; invoice → hosted payment → webhook → paid + revenue; **M-Pesa plan purchase → polling → plan applied**; **card plan purchase → redirect → webhook**; PDF receipt; audit-package ZIP; report PDF/CSV; invite → sign-up → join as contributor (finance hidden, billing API 403); new founder sign-up → onboarding → dashboard; webhook rejects bad challenge / forged `api_ref`, replay idempotent; crons require `CRON_SECRET`.
* **19/19 auth & session flows** in real Chromium, stable across repeated clean runs: passkey registration and passwordless sign-in (real WebAuthn ceremony via Chrome's virtual authenticator, verified server-side by SimpleWebAuthn, session minted through GoTrue); TOTP enrolment with real RFC 6238 codes (wrong code rejected); owners can't enforce 2FA without having it; enforced 2FA blocks directors until enrolled but not contributors; password → TOTP challenge → app; MFA-gated tenant archive (verified zero rows from other workspaces); offboarding confirm → read-only → cancel; “remember this device” off = browser-session cookies, on = 30 days; inactivity timeout; workspace switching (forged switch → 403); expired workspace read-only with a clear error while billing stays usable.
* **0 axe-core violations (WCAG 2.2 AA)** on 27 pages in dark, light and 375 px mobile, and no horizontal overflow on mobile.
* `npm audit --omit=dev`: **0 vulnerabilities** in production dependencies.
* Builds and boots with **no env vars** (setup notice, honest `503` health).

**Not verifiable here — needs your real accounts**
* **IntaSend live API.** The e2e flows ran against a local mock that mirrors the request/response shapes this app uses. Confirm in IntaSend **sandbox** before going live (especially field names and the webhook payload).
* **Supabase Realtime and Storage** weren't available in the local stack: live updates and presence showed their honest "paused/offline" states, and file uploads (evidence, vault, avatars) and the storage RLS policies were tested with SQL only, not through the Storage API.
* **OAuth (Google/Azure) and SAML SSO** need real identity providers; the code paths are implemented and unit-tested (correct provider/domain calls), but not exercised end-to-end. Passkeys were tested with a virtual authenticator, not a physical YubiKey.
* **Email delivery** (Resend) was never sent for real; all email paths report "not configured" honestly when the key is absent.
* `npm audit` (incl. dev tooling): 41 advisories remain in **dev-only** dependencies (Jest 29 / ESLint 8 internals), 0 critical, none shipped to production.

---

## Bugs found by testing (and fixed)

Kept here because they show what the test layers catch:
* **RLS**: unqualified `org_id` inside policy subqueries resolved to the inner table (`m.org_id = m.org_id`, always true) — would have let users attach rows to other workspaces' meetings/messages/votes/kudos.
* **Remember this device** silently did nothing: `@supabase/ssr` 0.12 ignores `cookieOptions.maxAge` and always writes 400-day cookies. The browser client now uses its own cookie writer.
* **Inactivity timeout** could be skipped until the app shell had mirrored the org's timeout into a cookie; the middleware now enforces the 8 h default meanwhile.
* **Renewal reminders** would have emailed owners *every hour* if the dedupe notification failed to save; **M-Pesa checkout** could leave polling with nothing to reconcile if the invoice id failed to save. Both now fail safe.
* Route-handler wrapper swallowed Next's dynamic-rendering signal (could bake a static 500 at build time); server pages imported helpers from a `'use client'` module; `.ics` semicolons unescaped; several WCAG contrast failures in light mode and the chart tooltip.

## Deliberate deviations from the build prompt

* **Next.js 15.5.27 + React 19 instead of the pinned 14.2.35.** The 14.x line is end-of-life and 14.2.35 (its last release) is affected by published **critical** advisories (unauthenticated RCE in the image optimizer; RCE on Windows hosts) and several high-severity ones; fixes start at 15.5.24. The async `params`/`cookies()`/`headers()` migration was done and re-verified with every test suite above. Next's bundled `postcss` is pinned to a patched version via `overrides`.
* **Copy changed where the design implied things the product can't truthfully claim**: no "FedRAMP ready", no peer benchmarks, no "continuous 24/7 testing", no "settled via Wise/Deel" (payroll is *recorded*), "phishing simulation" → security-awareness training, "enforce hardware keys" → "require two-factor for admins", AWS CloudTrail shown as "coming soon", SCIM removed.
* **Google Calendar/Outlook** integration is `.ics` email invites + an "Add to Google Calendar" link, not OAuth calendar sync.
* **Quiet hours** applies to renewal-reminder emails (held until each owner's working hours); check-in reminders are always sent at 16:00 local time, and digests at the time the admin chose.
* **Sentry** (optional in the prompt) is not wired in.
* **i18n**: the prompt asked for strings in `src/i18n/en.ts`; they are inline instead (English only). Numbers, dates and currency use `Intl` with the `en-KE` locale.

## Roadmap / not built
SCIM provisioning · AWS CloudTrail ingestion · Kiswahili UI (UI strings are currently inline in components; adding a language means extracting them with `next-intl`) · native mobile apps · OAuth calendar sync · automatic currency conversion between KES and USD (finance metrics count entries in the workspace's currency only).
