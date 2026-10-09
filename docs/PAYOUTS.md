# M-Pesa payroll payouts

**Operations → Finance → M-Pesa payouts** pays salaries straight to M-Pesa through IntaSend's **Send Money (B2C)** API.

How it works:
1. An owner or director **drafts a batch**: a name, then people entered row by row or pasted as CSV (`name, phone, amount`). Each line is checked:
   - Kenyan M-Pesa numbers only (07…, 01… and +254… are normalised).
   - KES 10–250,000 per person.
   - At most 500 lines.
2. **A different owner or director approves it.**
   - The person who drafted the batch can't approve it.
   - The approver must be in a two-factor session; if not, they are sent to verify first.
   - Approval is a single atomic step, so a batch can't be sent twice.
3. OrbitOS sends the batch to IntaSend and releases it. Statuses update from the IntaSend webhook, from **Refresh status**, and from the hourly job.
4. When the batch finishes:
   - Each line shows **Paid** or **Failed** (with the reason).
   - The batch becomes Paid, Some failed or Failed.
   - A **payroll run** is recorded for the amount actually paid, and the drafter gets a notification.

Contributors can't see payouts. Auditors can read them. Batches and lines can only be written by the server (row-level security), and every step is in the audit log.

## Setup (IntaSend)
1. **Enable Send Money / B2C** on your IntaSend account. This is a separate activation from collections; ask IntaSend support if the option isn't in your dashboard.
2. **Fund the wallet** with enough for the batch *plus* M-Pesa transfer fees. If the balance is too low, IntaSend rejects the batch and nothing is paid.
3. Use the same `INTASEND_PUBLISHABLE_KEY` / `INTASEND_SECRET_KEY` as for payments, and test in sandbox first (`INTASEND_TEST_MODE=true`).
4. **Webhook:** use the same URL as payments (`https://<your-app>/api/webhooks/intasend`). Payout events are recognised by their `tracking_id`, and their status is always re-fetched from IntaSend rather than trusted from the payload.
5. **Device / IP allow-listing:** if your IntaSend account requires approved IPs for send-money, add Vercel's egress IPs or ask IntaSend to allow API approval.

OrbitOS calls these IntaSend endpoints:
- `POST /api/v1/send-money/initiate/` with `provider: MPESA-B2C`, `currency: KES` and `requires_approval: YES`
- `POST /api/v1/send-money/approve/` (sends the initiate response back, including its nonce)
- `POST /api/v1/send-money/status/`

A batch counts as done on `BC100`; each transaction counts as paid on `TS100`. **Check these field names and codes in the IntaSend sandbox before going live**, because the local tests run against a mock with the same shapes (`src/lib/intasend/client.ts`).

## If something goes wrong
- **"Failed — no money moved".** IntaSend refused the batch at the first step, for example because of the balance or a missing B2C activation. Fix the cause and draft the batch again.
- **"Release step failed".** The batch exists at IntaSend but may not have been released. Check the IntaSend dashboard. The hourly job keeps syncing the batch until it finishes.
- **Failed lines.** The usual causes are an unregistered number or a number not on M-Pesa. Pay those people in a new batch once the number is fixed.
