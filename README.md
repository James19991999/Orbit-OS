# OrbitOS

**The distributed operating system for remote-first companies.** One calm cockpit for founders and operations leaders: company health, sprints, runway, time-zone scheduling, culture, compliance and board reports — across every city the team works from. Built for African teams first: **check-ins and approvals on WhatsApp, salaries paid to M-Pesa, KRA eTIMS tax invoices, every screen in Kiswahili and French, and a mode for slow connections** — plus an **AI chief of staff** that writes the founder's Monday brief.

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
| **Operations** | Sprints + Kanban (drag-and-drop *and* per-card status menu for keyboard/touch), task detail; cash, burn, runway, net cash flow, 6-month chart; two-person expense approvals; recorded payroll (+ CSV import); client invoices paid by IntaSend link and **fiscalised with KRA eTIMS** (receipt number, QR code, credit notes on void, offline-safe queue) — [docs/ETIMS.md](docs/ETIMS.md); realtime team activity (incl. GitHub PRs) |
| **Scheduling** | Live team matrix by hub, **computed golden-overlap window** (DST- and date-line-correct), deterministic slot finder, cognitive load, meetings with Jitsi video links, RSVPs; **two-way Google Calendar & Outlook sync** (meetings appear in people's calendars, slot finder avoids busy times) with `.ics` email invites for everyone else — [docs/CALENDAR.md](docs/CALENDAR.md) |
| **Culture** | Lounges with Realtime Presence and a **shared, server-anchored focus timer**, pulse/announcement/eNPS polls with truly anonymous votes, async roll call, channels with threads/pinning/typing indicator, kudos with badges and reactions |
| **Compliance** | SOC 2 / GDPR / ISO 27001 / HIPAA starter control sets, owners, statuses, evidence uploads, DSAR tracker, device fleet (+ CSV), security-awareness campaigns with rate-limited reminders, MFA-gated legal vault, security log, **audit-ready ZIP** (summary PDF + CSVs + evidence) |
| **Reports** | Velocity index, sync load and cost, async rate, 4 domain modules, rule-based chrono-optimizer (suggest → confirm → move meeting), PDF/CSV export, Slack dispatch, scheduled email/Slack digests |
| **People** | Directory with live local times, working status, filters, member detail |
| **Time off** | Leave requests (annual, sick, maternity, paternity, compassionate, study, unpaid), working-day counts, a 21-day annual allowance by default (editable), approvals by owners/directors (never your own, unless you're the only manager), cancellations, **who's away** for everyone (type and note stay private), and the slot finder skips people on leave |
| **My day** | One personal screen: my tasks (overdue, today, in progress, next), today's meetings with Join, my check-in, approvals waiting (expenses, time off), new mentions, who's away |
| **Imports** | People (as invitations, seat-limit aware, with job title and department) and tasks from **Excel (.xlsx), CSV or rows pasted from a spreadsheet**: columns matched automatically (English, Kiswahili, French headers), every row checked before import, templates to download |
| **Phone notifications** | Web Push to phones and computers in each person's language, instantly via a Supabase webhook with an hourly catch-up; dead devices cleaned up ([docs/PUSH.md](docs/PUSH.md)) |
| **Everyday use** | **Getting-started checklist** for new workspaces (ticked from real data); **search everything** with Ctrl/⌘+K or `/` (tasks, people, meetings, invoices for finance roles, pages, actions); **comments with @mentions** on tasks (mentioned people, the assignee and creator are notified); **Undo** instead of “are you sure?” when deleting a task (comments come back too, for 10 minutes); **keyboard shortcuts** (`N` new task, `G` then a letter to jump, `?` for the list) |
| **Settings** | Org & legal entities, SSO/MFA/session policy, Slack + GitHub integrations, timezone engine, RBAC & invites, billing, data residency, full tenant archive, offboarding with 30-day deletion |
| **Auth** | Email/password, Google Workspace, Microsoft Entra ID, SAML SSO (per-workspace domain), **passkeys (WebAuthn)**, TOTP two-factor, remember-device, inactivity timeout, invites, onboarding |
| **WhatsApp** | Link a number with a code; daily check-in reminders you **answer by replying**; **Approve / Reject buttons** for expenses (never your own); STOP / START / HELP; signed, idempotent webhook — [docs/WHATSAPP.md](docs/WHATSAPP.md) |
| **M-Pesa payouts** | Pay salaries to M-Pesa via IntaSend B2C: draft (rows or CSV) → **a second owner/director approves with two-factor** → paid; per-person status, payroll run recorded — [docs/PAYOUTS.md](docs/PAYOUTS.md) |
| **AI chief of staff** | Owner opt-in. Monday 08:00 brief in each owner's/director's time zone and language (wins, blockers, who to check in with, what's waiting on you), plus on-demand check-in summaries; Claude, with a rule-based fallback — [docs/AI-CHIEF-OF-STAFF.md](docs/AI-CHIEF-OF-STAFF.md) |
| **Languages** | **English, Kiswahili, French on every screen**, in emails, WhatsApp, notifications and the audit log; dates and weekdays per language; public site prerendered at `/`, `/sw` and `/fr` with hreflang. Picker on the sign-in page, the public site and in Profile; browser language by default. PDF exports and legal pages stay English. Kiswahili/French are machine-assisted drafts — have a native speaker review before launch |
| **Low bandwidth** | Installable app (PWA), offline page, **check-ins written offline are queued and sent on reconnect**, data saver (live updates paused until you tap Retry, photos as initials); signed-in pages are never cached on the device |
| **Platform** | Notifications (realtime bell), append-only audit log with CSV export, light/dark/system themes, marketing site, legal pages, SEO (sitemap, robots, OG image) |

---

## Setup (production)

> **Going live?** Follow [`docs/GO-LIVE.md`](docs/GO-LIVE.md) — the step-by-step checklist with the exact Supabase, Resend, Vercel, Sentry and IntaSend settings, the production smoke test, and the day-one steps. The summary below is the short version.

### 1. Supabase
1. Create a project (Pro plan if you need SAML SSO).
2. Link and push the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations/*
   ```
   No CLI? Paste `supabase/setup_all.sql` (all migrations in one transaction) into **SQL Editor** and run it once, then run `supabase/verify_setup.sql` — every row should say `ok = true`.
   **Already have OrbitOS in this project?** Don't run `setup_all.sql`. Run the update files in order, each once: `supabase/update_differentiators.sql` (if set up before 9 Oct 2026 — WhatsApp, payouts, languages, AI briefs), then `supabase/update_etims_calendar.sql` (if set up before 11 Oct 2026 — KRA eTIMS and calendar sync), then `supabase/update_founder_console.sql` (Founder Console data), then `supabase/update_security.sql` (upload limits, two-factor for vault changes), then `supabase/update_comments_undo.sql` (task comments and undo), then `supabase/update_leave_push.sql` (time off, phone notifications). The first three refuse to run twice; the security update is safe to re-run. Then `verify_setup.sql`.
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
4. For **M-Pesa payouts**, ask IntaSend to enable Send Money (B2C) and fund the wallet — see [docs/PAYOUTS.md](docs/PAYOUTS.md).

### 3. Resend (email)
Verify your sending domain and set `RESEND_API_KEY` + `EMAIL_FROM`. Without it, the app still works: invites show a copyable link and every email-dependent action reports "email not configured" instead of pretending.

### 4. Vercel
1. Import the repo, set the env vars from `.env.example`, deploy.
2. Background jobs: the daily ones (health snapshot, retention) are Vercel crons in `vercel.json`. The hourly ones (digests, check-in reminders, renewal reminders, payout status sync, AI briefs, eTIMS retries, calendar busy-time refresh) run from **GitHub Actions** (`.github/workflows/hourly-jobs.yml`) because Vercel Hobby only allows daily crons. Add repo secrets `ORBITOS_URL` and `CRON_SECRET`. On Vercel Pro you can move them back into `vercel.json`.
3. Optional: `NEXT_PUBLIC_ROOT_DOMAIN=orbitos.io` + a `*.orbitos.io` wildcard domain for subdomain tenancy (`acme.orbitos.io`). Without it, tenancy uses the workspace switcher + a cookie.
4. Optional: `UPSTASH_REDIS_REST_URL/TOKEN` for distributed rate limiting (in-memory otherwise).

### 5. Sentry (error alerts)
1. Create a free Sentry project (platform **Next.js**) and copy its DSN into `NEXT_PUBLIC_SENTRY_DSN`. Redeploy — the DSN is read at build time.
2. Optional, for readable stack traces: `SENTRY_AUTH_TOKEN` (an org auth token with `project:releases`), `SENTRY_ORG`, `SENTRY_PROJECT`. Source maps are uploaded at build time and then deleted from the deployment.
3. What is reported: uncaught errors in pages, route handlers and middleware (`src/instrumentation.ts`), every API 5xx the route wrapper turns into a friendly `500` (`src/lib/api.ts`), and browser crashes caught by the error boundaries. Errors only — no tracing, no session replay. Cookies, auth headers, request bodies, one-time tokens in URLs and emails are stripped before sending (`src/lib/observability/sentry-options.ts`); users are identified by id only.
4. Browser events go through the same-origin `/monitoring` tunnel, so ad-blockers don't drop them and the CSP needs no change. Without a DSN, Sentry is completely off and the build is unchanged.

### 6. WhatsApp (optional)
Meta app, number, webhook `https://<your-app>/api/webhooks/whatsapp`, four approved templates and four env vars — step by step in [docs/WHATSAPP.md](docs/WHATSAPP.md). Off (email only) until configured.

### 7. Claude for the AI chief of staff (optional)
`ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`, default `claude-haiku-5-5`). The owner still has to turn it on in the app. Without a key, briefs are a rule-based summary. See [docs/AI-CHIEF-OF-STAFF.md](docs/AI-CHIEF-OF-STAFF.md).

### 8. KRA eTIMS (optional)
`ENCRYPTION_KEY` plus the `ETIMS_*` variables for your own receipts; each workspace connects its own device in Settings. OrbitOS must first be vetted by KRA as an integrator — step by step in [docs/ETIMS.md](docs/ETIMS.md).

### 9. Google Calendar & Outlook (optional)
`ENCRYPTION_KEY` plus a Google OAuth client and/or a Microsoft app registration, with redirect URIs `https://<your-app>/api/calendar/callback/google` and `…/microsoft` — [docs/CALENDAR.md](docs/CALENDAR.md).

### 11. Security checklist (do this before launch)
The app's protections and the one-hour account checklist (two-factor everywhere, GitHub secret scanning, Vercel preview protection, Supabase password rules, Upstash) are in [docs/SECURITY.md](docs/SECURITY.md).

### 10. Founder Console (recommended)
Set `FOUNDER_EMAILS` to your sign-in email and redeploy. `/founder` then shows people online, revenue, background jobs, undelivered messages, errors and every workspace — read-only, two-factor required, every visit logged. English only (it is an operator page). [docs/FOUNDER.md](docs/FOUNDER.md).

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
| `npm test` | **174 Jest tests** (incl. working days and leave balance; CSV/paste parsing, day-first and Excel dates, header matching in three languages, row checks) (incl. @mention parsing) (incl. the cross-site/oversized request guard and wildcard escaping) (incl. eTIMS VAT maths, payload shape and result codes) (incl. WhatsApp message parsing, payout line validation, translations — every key in Kiswahili and French with matching placeholders — and the AI brief prompt and fallback): scheduling (DST, date line, weekends), health/finance/sprint/people metrics, pricing, phone normalisation, `.ics`, PDF/CSV (formula-injection), GitHub HMAC, session rules, open-redirect guard, IntaSend webhook + checkout + renewals-cron **route handlers** (incl. failure paths), and component tests (login paths, poll rollback, roll call, sign-out failure, clipboard failure, jest-axe), Sentry event scrubbing, money/date formatting and parsing per region |
| `npm run test:db` | **188 SQL tests** (incl. leave private to the person and managers, decisions only via approval and never your own, no double-booking, who's-away dates only; push devices per person and https-only; comments limited to the workspace and to people who can write, mentions only notify members, undo only by whoever deleted; upload size/type limits enforced by storage, vault changes need two-factor; Founder Console tables and summary functions unreadable by any signed-in user or anonymous caller; eTIMS documents readable by owner/director/auditor only, numbering and keys server-only, fiscalised invoices can't be edited or deleted; calendar tokens never readable, busy times visible to teammates only) against a real Postgres: migrations + seed + RLS (cross-tenant isolation, role escalation, client-unwritable billing/audit/plan columns, anonymous votes, expired-workspace read-only, MFA-gated vault, payment idempotency, two-person expense rule, allowed currencies, WhatsApp links/codes server-only, payouts hidden from contributors and unwritable by clients, AI briefs private to their reader, `ai_enabled` owner-API only) |
| `npm run stack:up` | Boots a **local Supabase-compatible stack**: Postgres + real **GoTrue** (Supabase Auth) + real **PostgREST** + a gateway on `:54321`, plus mocks of **IntaSend** (`:54400`), the **WhatsApp Cloud API** (`:54410`), the **Anthropic API** (`:54420`), **KRA eTIMS** (`:54430`) and **Google Calendar / Microsoft Graph** (`:54440`); applies migrations + seed and writes `.env.local` |
| `npm run test:e2e` | **27 end-to-end business flows** in real Chromium against that stack (see below) |
| `npm run test:e2e:security` | **19 end-to-end auth/session flows**: passkeys via Chrome's virtual WebAuthn authenticator, TOTP with real codes, enforced 2FA, MFA-gated archive/offboarding, remember-device cookie lifetimes, inactivity timeout, workspace switching, expired-workspace read-only. Run after `test:e2e` on the same database |
| `npm run test:e2e:features` | **36 flows** for WhatsApp (link, reply → check-in, one-tap approval, forged signature, retries), offline/PWA, data saver, M-Pesa payouts (two-person + 2FA, partial failure, RLS), languages (French browser, Kiswahili switch, no hydration errors) and the AI chief of staff (opt-in, prompt, fallback, Monday delivery once). If `ANTHROPIC_BASE_URL` is set in your shell, start the app with it pointing at the mock |
| `npm run test:e2e:integrations` | **25 flows** for KRA eTIMS (connect device, register item, fiscalise invoice, QR on PDF, KRA down → queued → retried, rejection frees the number, credit note on void, plan receipts) and calendar sync (Google and Outlook connect, events created/moved/removed, busy times in the slot finder, revoked access) against the simulators |
| `npm run test:e2e:i18n` | Signs in as the same person in English, Kiswahili and French, opens **every screen** and lists UI text that is identical in English and the other language (only user data should remain) |
| `npm run test:e2e:founder` | **12 checks** for the Founder Console: signed-out → login, other people → 404 and no menu link, founder without 2FA → 2FA setup, numbers match the database, online list, job runs recorded (rejected cron calls aren't), undelivered messages, workspace search, visits logged, summary functions closed to the public API |
| `npm run test:e2e:ux` | **15 checks**: getting-started checklist (owners only, hide persists), Ctrl+K search (tasks, people, invoices; contributors never see invoices; signed-out 401), shortcuts (and not while typing), @mention picked from suggestions → notification in the reader’s language, auditors read-only, delete → Undo restores task and comments without re-notifying, axe on every new screen |
| `npm run test:e2e:work` | **18 checks**: time off (request → managers told → approve with message → teammate told; who's away without leaking type/note; slot finder busy; cancel), My day, task import by paste (bad rows explained), people import from a real .xlsx (title/department carried), server re-checks and seat limit, push (Profile switch, encrypted test decrypted, webhook in the reader's language once, hourly catch-up, dead devices removed, https-only). Start the app with `NODE_EXTRA_CA_CERTS=/tmp/orbit-push/cert.pem` |
| `npm run test:e2e:attacks` | **14 attack checks** (run last): cross-site request forgery, look-alike origins, oversized bodies (with and without a size header), wildcard email tricks, security headers, framing, `security.txt`, error details, public access to founder data, request floods |
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
  app/api/           44 route handlers (billing, webhooks incl. WhatsApp, crons, payouts, AI briefs, exports, integrations, members, passkeys…)
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

## Currencies & regional formats

* **Four currencies: KES, USD, EUR, GBP.** A workspace picks one at onboarding (suggested from the founder's browser region: US → USD, UK → GBP, euro area → EUR) and can change it in Settings → Organization. Plans are priced in all four in `src/lib/billing/plans.ts` (EUR/GBP are set by hand, not converted). M-Pesa is always charged in KES; cards in the workspace currency. Client invoices can be issued in any of the four, whatever the workspace currency.
* **`INTASEND_CARD_CURRENCIES`** (default `KES,USD,EUR,GBP`) lists the currencies your IntaSend account can take by card. If the workspace currency isn't listed, plans are charged in USD instead, and client invoices in that currency are sent without a payment link (the email asks for a bank transfer).
* **Regional formats.** Language (English, Kiswahili, French) is chosen separately; numbers, money and dates follow the viewer's region: from the browser's language (`Accept-Language`) or **Profile → Region format** (stored per device), defaulting to Kenya. `en-US` shows `$1,234.50` and `Oct 8, 2026, 5:30 PM`; Germany `€1.234,50` and `8 Oct 2026, 17:30`; India groups `1,23,456.50`; Canada/Australia write `US$` to avoid confusion with their own dollar. Timestamps show in the user's profile time zone.
* **Why not plain `Intl`:** browsers ship trimmed locale data for "English + region" locales, so Node and Chrome disagree (`en-FR` → `1 234,50` vs `1,234.50`; `en-CA` → `$` vs `US$`), which breaks hydration. Each offered region's separators, grouping, date order and clock are spelled out in `src/lib/locale/conventions.ts`. Add a region there and in `REGION_OPTIONS`.
* Server code uses `await getFormat()` (`src/lib/locale/server.ts`); client components use `useFormat()` (`src/lib/locale/client.tsx`). Relative times render through `<TimeAgo>`, which tolerates the minute ticking over between server render and hydration. Client-facing emails (invoices) and scheduled digests have no viewer, so they use the currency's region (USD → US style, GBP → UK style, EUR → Irish style, KES → Kenyan).

## Payments (IntaSend)

* **Platform plans** (`/settings/billing`, owner-only): M-Pesa STK push (KES) or hosted card checkout (workspace currency). One-time payment per month/year — **no auto-renewal** (M-Pesa can't be charged silently). Reminders at T-7/T-3/T-0, 3-day grace, then read-only (never deleted).
* **STK polling is bounded to 90 s**, then the page says "still waiting" and the webhook settles it.
* **Client invoices**: "Send invoice" creates an IntaSend checkout link and emails it; the webhook marks the invoice paid and books revenue. Manual "mark paid" exists for bank transfers.
* **Webhook security**: constant-time challenge check → **status re-fetched from IntaSend with the secret key** → `api_ref` must match → idempotent RPC. The challenge scheme alone is weaker than HMAC signing; the re-fetch is what makes it safe.
* Pricing lives in **`src/lib/billing/plans.ts`** (minor units). Edit there only.

---

## Performance

**Page-to-page navigation.** Clicking a link keeps the current page on screen with a thin progress bar until the next page is fully drawn — no placeholder boxes. Each app page makes its database calls in as few rounds as possible (the member list, page data and follow-ups load together; Culture and Operations start their tab's queries before the member list returns). Sign-in checks use `getClaims()`, which needs no network call on Supabase projects with JWT signing keys. With a simulated 90 ms gap between the app and the database, Culture went from 12 sequential rounds to 5. For production, run the Vercel functions in the same region as Supabase (docs/GO-LIVE.md, Step 3).

Lighthouse (median of 3 runs, production build):

| Pages | Desktop | Mobile (simulated slow 4G, 4× slower CPU) |
|---|---|---|
| Public: home, pricing, security, trust, sign-in, sign-up | 100 | 93–100 |
| Signed-in app: dashboard, operations, scheduling, culture, compliance, reports, people, settings, profile | 99–100 | 75–92 (heaviest: operations, culture) |

Accessibility, best practices and SEO are 100 on every page measured. What keeps it fast:
* **Fonts:** the icon font is subset to the ~210 icons used (3.4 MB → 23 KB) and Geist to Latin (70 → 36 KB each), preloaded. Icons sit in fixed squares, so nothing shifts as fonts load. After adding an icon, run `npm run fonts` (needs `pip install fonttools brotli`).
* **Less JavaScript at start-up:**
  * Sentry loads after the page is idle (~130 KB).
  * The passkey library loads only when a passkey is used.
  * Supabase loads only on submit on the sign-in, sign-up and reset pages, and is evaluated on first use in the app.
* **Links prefetch on intent** (hover, focus, touch) instead of prefetching every link in view.
* **Live updates connect when idle.**
* **Timezone formatters are cached.**
* **Offline page:** a self-contained `public/offline.html`, so it keeps working across releases.

The remaining mobile cost on the app is React and Next.js start-up plus the Supabase client. Real devices on a normal connection paint signed-in pages in under half a second.

---

## SEO

Lighthouse SEO is **100 on every public page** (home, pricing, security, trust, sign-in, sign-up, privacy, terms; English, Kiswahili and French; desktop and mobile), with performance 94–100 and accessibility and best practices 100.
* **Search titles and descriptions** written around what people search for (remote team management, HR software Kenya, M-Pesa, KRA eTIMS), in all three languages.
* **Every language linked** (`hreflang` + `x-default`) and a **canonical** address on each page, so Google shows people the right language and never counts versions as duplicates.
* **Structured data** (schema.org): Organization, WebSite and SoftwareApplication with plan prices in KES on the home page; FAQ, prices and breadcrumbs on pricing.
* **Share previews**: a 1200×630 image, Open Graph and X/Twitter tags on every page (WhatsApp, LinkedIn, Facebook, Slack).
* **Sitemap** (`/sitemap.xml`) with all language versions and **robots.txt** keeping the signed-in app, invites and payment pages out of search. Password-reset and invite pages are `noindex`.
* Site address: `NEXT_PUBLIC_APP_URL`, falling back to the Vercel production domain, so tags never point at localhost.
* Ranking also needs time, content and links from other sites; see docs/GO-LIVE.md → Search engines.

## Verification status

**Proven in this build environment**
* TypeScript strict: 0 errors · ESLint: 0 warnings · production build: 110 routes (59 API); every public page static, `/sw` and `/fr` prerendered.
* **174/174 Jest**, **188/188 SQL RLS tests on real Postgres 16**.
* **18/18 checks** for time off, My day, imports and push notifications (pushes decrypted end to end).
* **15/15 everyday-use checks** (checklist, search, shortcuts, comments and mentions, undo).
* **14/14 attack checks** against the running app (CSRF, floods, oversized bodies, wildcard look-ups, headers, framing, error leaks).
* **12/12 Founder Console checks** (access rules, 2FA, numbers matching the database, job and delivery recording, audit), and 0 axe violations with no mobile overflow on `/founder`.
* **25/25 integration flows** (KRA eTIMS and Google/Outlook calendar sync) in real Chromium against simulators of KRA's OSCU API, Google Calendar and Microsoft Graph.
* **Every screen translated**: the browser check signs in as the same person in English, Kiswahili and French across 23 screens; the only identical text left is user data (task titles, names, time-zone ids).
* **Database upgrade path**: an October 9 database + `update_etims_calendar.sql` + `update_founder_console.sql` + `update_security.sql` + `update_comments_undo.sql` + `update_leave_push.sql` gives a schema identical to a fresh `setup_all.sql`; both pass all 17 `verify_setup.sql` checks.
* **36/36 feature flows** (WhatsApp, offline, data saver, M-Pesa payouts, languages, AI chief of staff) in real Chromium against the local stack and mocks.
* **27/27 end-to-end flows in real Chromium** against real Supabase Auth (GoTrue v2.170) + real PostgREST (v12.2) + Postgres, including: password sign-in; task create/move; expense forced to pending + two-person approval; check-in; poll; kudos; meeting scheduling (calendar-invite endpoint must return 200); training reminders; invoice → hosted payment → webhook → paid + revenue; **M-Pesa plan purchase → polling → plan applied**; **card plan purchase → redirect → webhook**; PDF receipt; audit-package ZIP; report PDF/CSV; invite → sign-up → join as contributor (finance hidden, billing API 403); new founder sign-up → onboarding → dashboard; webhook rejects bad challenge / forged `api_ref`, replay idempotent; crons require `CRON_SECRET`; a German-region browser sees `1.234,56` and switching Profile → Region format to United States shows `1,234.56` / `Oct 8, 2026` with no hydration errors.
* **No hydration mismatches** on 19 pages in six browser locales (de-DE, en-US, fr-FR, en-ZA, en-CA, sw-KE); the region-format code produces identical output in Node and Chromium (1,728 values compared).
* **19/19 auth & session flows** in real Chromium, stable across repeated clean runs: passkey registration and passwordless sign-in (real WebAuthn ceremony via Chrome's virtual authenticator, verified server-side by SimpleWebAuthn, session minted through GoTrue); TOTP enrolment with real RFC 6238 codes (wrong code rejected); owners can't enforce 2FA without having it; enforced 2FA blocks directors until enrolled but not contributors; password → TOTP challenge → app; MFA-gated tenant archive (verified zero rows from other workspaces); offboarding confirm → read-only → cancel; “remember this device” off = browser-session cookies, on = 30 days; inactivity timeout; workspace switching (forged switch → 403); expired workspace read-only with a clear error while billing stays usable.
* **0 axe-core violations (WCAG 2.2 AA)** on 27 pages in dark, light and 375 px mobile — in English, Kiswahili and French (`A11Y_LANG=sw|fr`) — and no horizontal overflow on mobile in any language.
* **Sentry**: with a DSN set, all 26 + 19 e2e flows produced **zero** error events; a forced server fault produced one event tagged with its route, with cookies, auth header and `?code=` stripped; a browser crash was sent through the `/monitoring` tunnel with no CSP violation.
* `npm audit --omit=dev`: **0 vulnerabilities** in production dependencies.
* Builds and boots with **no env vars** (setup notice, honest `503` health).

**Not verifiable here — needs your real accounts**
* **KRA eTIMS** and **Google Calendar / Outlook** were exercised against local simulators built from the published API shapes. KRA must vet OrbitOS as an integrator, and its sandbox run is a go-live step ([docs/ETIMS.md](docs/ETIMS.md)); connect one real Google and one real Microsoft account before announcing sync ([docs/CALENDAR.md](docs/CALENDAR.md)).
* **Kiswahili and French** are machine-assisted drafts: have a native speaker of each review the strings in `src/i18n/` before launch.
* **WhatsApp Cloud API, IntaSend Send Money (B2C) and the Claude API** were exercised against local mocks with the documented request/response shapes. Before relying on them: get the four templates approved and test with a real number; run a small payout in IntaSend sandbox; generate one brief with your real key.
* **IntaSend live API.** The e2e flows ran against a local mock that mirrors the request/response shapes this app uses. Confirm in IntaSend **sandbox** before going live (especially field names and the webhook payload).
* **Supabase Realtime and Storage** weren't available in the local stack: live updates and presence showed their honest "paused/offline" states, and file uploads (evidence, vault, avatars) and the storage RLS policies were tested with SQL only, not through the Storage API.
* **OAuth (Google/Azure) and SAML SSO** need real identity providers; the code paths are implemented and unit-tested (correct provider/domain calls), but not exercised end-to-end. Passkeys were tested with a virtual authenticator, not a physical YubiKey.
* **Sentry delivery to sentry.io**: events were captured by a local fake ingest; the `/monitoring` tunnel's onward hop to sentry.io needs real network.
* **Email delivery** (Resend) was never sent for real; all email paths report "not configured" honestly when the key is absent.
* `npm audit` (incl. dev tooling): 41 advisories remain in **dev-only** dependencies (Jest 29 / ESLint 8 internals), 0 critical, none shipped to production.

---

## Bugs found by testing (and fixed)

Kept here because they show what the test layers catch:
* **Calendar invites and training reminders always failed** (found by Sentry on its first run): both routes asked PostgREST to embed `profiles` from tables whose `user_id` references `auth.users`, which has no relationship to `profiles` → "Could not find a relationship" → 500. The meeting dialog still said "Meeting saved", so the e2e flow passed. Both now load profiles separately (`src/lib/data/profiles.ts`), and the e2e suite asserts the invite endpoint's status and covers training reminders.
* **RLS**: unqualified `org_id` inside policy subqueries resolved to the inner table (`m.org_id = m.org_id`, always true) — would have let users attach rows to other workspaces' meetings/messages/votes/kudos.
* **Remember this device** silently did nothing: `@supabase/ssr` 0.12 ignores `cookieOptions.maxAge` and always writes 400-day cookies. The browser client now uses its own cookie writer.
* **Inactivity timeout** could be skipped until the app shell had mirrored the org's timeout into a cookie; the middleware now enforces the 8 h default meanwhile.
* **Renewal reminders** would have emailed owners *every hour* if the dedupe notification failed to save; **M-Pesa checkout** could leave polling with nothing to reconcile if the invoice id failed to save. Both now fail safe.
* Route-handler wrapper swallowed Next's dynamic-rendering signal (could bake a static 500 at build time); server pages imported helpers from a `'use client'` module; `.ics` semicolons unescaped; several WCAG contrast failures in light mode and the chart tooltip.

## Deliberate deviations from the build prompt

* **Next.js 15.5.27 + React 19 instead of the pinned 14.2.35.** The 14.x line is end-of-life and 14.2.35 (its last release) is affected by published **critical** advisories (unauthenticated RCE in the image optimizer; RCE on Windows hosts) and several high-severity ones; fixes start at 15.5.24. The async `params`/`cookies()`/`headers()` migration was done and re-verified with every test suite above. Next's bundled `postcss` is pinned to a patched version via `overrides`.
* **Copy changed where the design implied things the product can't truthfully claim**: no "FedRAMP ready", no peer benchmarks, no "continuous 24/7 testing", no "settled via Wise/Deel" (payroll is *recorded*), "phishing simulation" → security-awareness training, "enforce hardware keys" → "require two-factor for admins", AWS CloudTrail shown as "coming soon", SCIM removed.
* **Quiet hours** applies to renewal-reminder emails (held until each owner's working hours); check-in reminders are always sent at 16:00 local time, and digests at the time the admin chose.
* **i18n**: all strings live in `src/i18n/` (`en.ts`, `sw.ts`, `fr.ts` plus one file per area in `modules/`, each with all three languages side by side). Only the strings a page needs reach the browser; server-only text (`p.`, `email.`, `wa.`, `mk.`, `audit.`) never does. PDF exports and legal pages stay English. Numbers, dates and money follow each user's region — see *Currencies & regional formats*.

## Roadmap / not built
Native-speaker review of Kiswahili/French · translated PDF exports · local compliance packs (Kenya DPA, Nigeria NDPR, POPIA) · SCIM provisioning · AWS CloudTrail ingestion · native mobile apps · automatic currency conversion (finance metrics count entries in the workspace's currency only) · automatic card renewal.
