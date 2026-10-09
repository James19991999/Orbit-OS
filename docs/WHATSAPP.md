# WhatsApp setup

OrbitOS uses the **WhatsApp Cloud API** (Meta) for three things:

- **Check-in reminders.** At 16:00 local time on working days, people who linked WhatsApp get a reminder instead of an email. They reply right there, for example `4 Shipped the invoice flow. Blockers: waiting on legal`. The leading number (1–5) is their mood. The text after `Blockers:` (also `Vikwazo:` or `Blocages :`) is saved as blockers.
- **Expense approvals.** When an expense needs approval, every other owner and director who linked WhatsApp gets **Approve / Reject** buttons. The person who logged the expense can't approve it, and every decision is audited.
- **The weekly brief.** If the AI chief of staff is on, its headline arrives on Monday morning.

People link their own number under **Profile → WhatsApp**: OrbitOS sends a 6-digit code on WhatsApp. They can send `STOP` to pause messages, `START` to resume and `HELP` for instructions. These work in English, Kiswahili and French.

Without the four `WHATSAPP_*` variables, the feature is off. Profile shows "not switched on", and reminders go by email as before.

## 1. Meta app and number
1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create app → Business**, then add the **WhatsApp** product.
2. In **WhatsApp → API Setup**, add and verify the business phone number OrbitOS will send from. It must not be registered in the WhatsApp phone app.
3. Copy the **Phone number ID** and set it as `WHATSAPP_PHONE_NUMBER_ID`.
4. Create a **permanent token**:
   - Go to Business settings → Users → **System users** → Add (Admin).
   - Choose **Generate token** for your app with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
   - Set it as `WHATSAPP_TOKEN`. The 24-hour test token on the API Setup page expires, so don't use it.
5. In **App settings → Basic**, copy the **App secret** and set it as `WHATSAPP_APP_SECRET`. It is used to verify that webhooks really come from Meta.
6. Make up a long random string and set it as `WHATSAPP_VERIFY_TOKEN`.

## 2. Webhook
In **WhatsApp → Configuration → Webhook**:
- Callback URL: `https://<your-app>/api/webhooks/whatsapp`
- Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and save**, then **subscribe to the `messages` field**.

The webhook rejects any request whose `X-Hub-Signature-256` doesn't match the app secret. It also processes each message id only once, because Meta retries deliveries.

## 3. Message templates
Businesses may only start a conversation with an approved template. In **WhatsApp Manager → Message templates**, create these templates with exactly these names. Create each one in **English (`en`)**, and also in **Swahili (`sw`)** and **French (`fr`)** if your team uses those languages. Each person receives the template in their own language.

| Name | Category | Body (English) | Buttons |
|---|---|---|---|
| `orbitos_verify_code` | Authentication | *(Meta's standard authentication text)* `{{1}} is your verification code.` | Copy code (one-time password) |
| `orbitos_checkin_reminder` | Utility | `Hi {{1}}, time for your {{2}} check-in. Reply with what you shipped today — start with 1–5 for your mood, and add "Blockers:" if anything is in your way.` | — |
| `orbitos_expense_approval` | Utility | `{{1}} logged an expense of {{2}} for {{3}} in {{4}}. It needs your approval.` | Quick reply: `Approve`, `Reject` (in this order) |
| `orbitos_weekly_brief` | Utility | `Hi {{1}}, your weekly brief for {{2}} is ready: {{3}}` | — |

The parameters must stay in the order shown. Approval usually takes from a few minutes to a day. Until a template is approved, sending it fails. In that case check-in reminders fall back to email, and the other messages are skipped and logged.

## 4. Environment variables
```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
# Optional: WHATSAPP_API_BASE=https://graph.facebook.com/v21.0
```
Redeploy after setting them.

## 5. Test it
1. Go to Profile → WhatsApp, enter your number, then enter the code you receive. The card should say "Linked to …".
2. Send `HELP` to the business number. You should get the instructions back.
3. Log an expense above the approval threshold as one owner. A second owner or director should get Approve / Reject buttons.
4. Before 16:00 your time on a working day, don't check in. You should get the reminder within the hour (from the hourly GitHub Actions job).

## Privacy
- Numbers are stored as digits only (`whatsapp_links`), and each person sees only their own.
- Codes are stored as HMAC hashes, expire after 10 minutes and allow 5 attempts.
- Inbound messages are kept only by message id, to stop duplicates (`whatsapp_inbound`). The text itself is saved only when it becomes a check-in.
- Meta processes message content as WhatsApp's provider. List Meta as a subprocessor in your privacy policy.
