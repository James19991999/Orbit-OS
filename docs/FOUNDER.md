# Founder Console

A private page at **`/founder`** that shows how the whole platform is doing, across every workspace. It is meant for whoever runs OrbitOS, not for customers.

## What it shows

| Section | What's in it |
|---|---|
| **Signals** (top row) | Database response time · whether the background jobs ran on time · emails/WhatsApp messages that couldn't be delivered in the last 24 h · KRA eTIMS receipts waiting or rejected · new Sentry errors in the last 24 h |
| **People** | Online now (had OrbitOS open in the last 5 minutes, with names and workspaces), active today / this week / this month, sign-ins today, total people and new sign-ups |
| **Money** | Monthly recurring revenue per currency (each paying workspace's latest payment; annual ÷ 12), revenue this month vs last month, a 12-month revenue chart, plan mix, trials ending within 7 days, renewals due, failed payments this week |
| **Background jobs** | Each scheduled job's last run, how long it took, what it did, and run/failure counts. "Late" means no successful run when one was due |
| **Services and settings** | Which integrations this deployment has switched on (from the Vercel environment variables), and test/sandbox modes |
| **Undelivered messages** | The last 10 emails or WhatsApp messages the provider refused, with the error (kept 90 days) |
| **Errors** | Unresolved Sentry issues seen in the last 24 hours, linked to Sentry |
| **Workspaces** | Every workspace (newest first, searchable): plan, paid until, people, last active, lifetime revenue |

It refreshes itself every minute while the tab is open. It is **read-only**: nothing on it changes a workspace. It is in English only.

## Who can open it

All three must be true. Anyone else gets a plain "page not found", and the link never appears in their menu.

1. Their email is listed in the **`FOUNDER_EMAILS`** environment variable (comma-separated). It lives in Vercel, not in the code, so the public repository doesn't reveal who has access.
2. They are signed in.
3. They signed in with **two-factor authentication** in this session. The first visit asks you to set up an authenticator app if you haven't already.

Every visit is written to the `platform_audit` table (at most once per 10 minutes per person), with the time, the person and the IP address.

## Set it up

1. **Database.** In Supabase → SQL Editor, run `supabase/update_founder_console.sql` once (projects set up before 11 October 2026 must run `update_etims_calendar.sql` first). New projects get it from `setup_all.sql`. Then run `supabase/verify_setup.sql`: the row "Founder Console data" should be `true`.
2. **Vercel.** Add `FOUNDER_EMAILS` = your sign-in email, then **redeploy**.
3. **Sign in** to OrbitOS with that email, open the menu under your name, and choose **Founder console** (or go to `/founder`). Set up two-factor if asked.
4. **Optional: errors from Sentry.** Create a Sentry token with the `project:read` scope (Settings → Developer Settings → Personal Tokens) and set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`. If you already set these for readable stack traces, an Organization token works too. Self-hosted or EU Sentry: set `SENTRY_API_BASE` (default `https://sentry.io`).

## Where the numbers come from

- **Online / active**: every open OrbitOS tab sends a "still here" signal every 2 minutes while it is visible (one tiny database write a minute at most per person). Numbers start counting from the day you run the update; before that, nobody shows as active.
- **Revenue**: completed IntaSend plan payments in `billing_payments`. Invoice payments your customers collect from *their* clients are not OrbitOS revenue and are not counted.
- **Jobs**: each `/api/cron/*` call records its result. Calls rejected for a wrong `CRON_SECRET` are not recorded.
- **Undelivered**: failures reported by Resend or the WhatsApp Cloud API when sending.

## Privacy

The tables behind the console (`user_activity`, `job_runs`, `delivery_failures`, `platform_audit`) and the two summary functions can only be read with the server's service key. No signed-in user, including the founder's own browser, can query them directly. The console shows names and workspace names, never the contents of anyone's workspace.

## Customers to call, what customers ask, and the weekly email (October 13, 2026)

- **Customers to call** lists workspaces worth a phone call, with the reason: a failed payment not yet fixed, a plan that ran
  out (the workspace is read-only), nobody active for 7+ days, or a trial with no teammates after 3 days. The owner's
  name links to an email. Your own workspaces (FOUNDER_EMAILS) are left out.
- **What customers ask** shows the latest help-centre questions and whether the guides covered them. Unanswered ones are
  a to-do list for better guides or product fixes. Questions are deleted after 180 days.
- **Weekly email**: every Monday from 08:00 (FOUNDER_TIMEZONE, default Africa/Nairobi) the addresses in FOUNDER_EMAILS get
  new sign-ups, money in, trials ending, customers to call, unanswered questions and platform health. "Email me this
  week's summary" sends it any time (3 per hour).
- Customers also get automatic emails, each at most once: trial day 1, 3 and 7 and 2 days before the end; the day after,
  7 and 30 days after a plan runs out; and after a failed payment. Tips can be switched off with the link in each email
  or in Profile; account and payment emails always go. All of this needs email (Resend) to be set up.
