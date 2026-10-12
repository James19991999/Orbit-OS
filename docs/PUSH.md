# Phone and desktop notifications (Web Push)

People turn notifications on in **Profile → Phone and desktop notifications**. They then get an alert on that phone or computer, even when OrbitOS is closed, whenever something lands in their OrbitOS notifications:
- someone mentions them
- a task is assigned to them
- a comment is left on their task
- a time-off request needs their approval, or is decided
- payments, renewals and payouts

The text appears in each person's own language.

Notifications work in Chrome, Edge, Firefox and Samsung Internet on Android and desktop, and in Safari on Mac. On iPhone and iPad, people must first add OrbitOS to their Home Screen (**Share → Add to Home Screen**), then turn notifications on from the installed app (iOS 16.4 or later).

## 1. Create your keys (once)

In PowerShell, inside your OrbitOS folder (after `npm install`):

```powershell
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. In Vercel → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the Public Key |
| `VAPID_PRIVATE_KEY` | the Private Key (mark it **Sensitive**) |
| `VAPID_SUBJECT` | `mailto:` followed by your support email, e.g. `mailto:support@yourdomain.com` |
| `PUSH_WEBHOOK_SECRET` | a long random string, e.g. from `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |

Then **redeploy**. The public key is built into the app, so a redeploy is needed whenever it changes. Never change the keys after people have turned notifications on, because every device would need to turn them on again.

## 2. Instant delivery: a Supabase Database Webhook (once)

1. In Supabase, go to **Database → Webhooks → Create a new hook**. Enable webhooks if it asks.
2. Fill in:
   - **Name:** `push`
   - **Table:** `notifications`
   - **Events:** Insert only
   - **Type:** HTTP Request
   - **Method:** POST
   - **URL:** `https://<your-app>/api/webhooks/push`
   - **HTTP Headers:** add `Authorization` with the value `Bearer <your PUSH_WEBHOOK_SECRET>`
3. Save.

Without the webhook, notifications are still pushed by the hourly background job (`push` in `.github/workflows/hourly-jobs.yml`), but only within the hour.

## 3. Check it

1. On your phone, open OrbitOS, go to **Profile**, tap **Turn on** and allow notifications.
2. Tap **Send a test**. An "OrbitOS notifications are on" alert should arrive within seconds.
3. Ask a teammate to @mention you on a task. The alert should arrive immediately (webhook), and tapping it opens the task.

The Founder Console's **Services and settings** box shows whether Web Push is configured. Its **Background jobs** table shows the hourly catch-up.

## Privacy

- OrbitOS stores only each device's push address and its encryption keys, under that person.
- Messages are end-to-end encrypted to the device (RFC 8291), so the push service (Google, Mozilla, Apple) can't read them.
- Devices that are uninstalled or turned off are removed automatically the next time a push to them fails.
