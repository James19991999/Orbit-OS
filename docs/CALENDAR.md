# Google Calendar & Outlook sync

Each person can connect **one** calendar under **Profile → Calendar**: Google Calendar or Outlook (Microsoft 365 or Outlook.com). After that:

- **Meetings land in their calendar.** When an organiser sends invites, OrbitOS creates the event directly in every connected calendar, and updates or removes it when the meeting is rescheduled or cancelled. People without a connected calendar still get the usual email with an `.ics` attachment.
- **The slot finder avoids busy times.** OrbitOS reads each connected person's free/busy times hourly, and refreshes any that are out of date when the slot finder opens. It suggests slots where everyone is inside working hours *and* free. Teammates only ever see busy blocks, never event titles or details.

Without the settings below, the feature is off. Profile says sync isn't switched on, and invites keep going out by email.

> **Tested against a simulator only.** Connecting, token refresh, event create/update/delete, free/busy and revoked access are covered by `npm run test:e2e:integrations` against `scripts/local-stack/calendar-mock.mjs`. Connect a real Google and a real Microsoft account once before announcing it (step 3).

## 1. Google (Google Cloud Console)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (or pick one). Then go to **APIs & Services → Library** and enable the **Google Calendar API**.
2. In **OAuth consent screen**:
   - Choose **External**, then fill in the app name, support email and your domain.
   - Add the scopes `openid`, `email`, `.../auth/calendar.events` and `.../auth/calendar.freebusy`.
   - Calendar scopes are "sensitive", so Google must verify the app before people outside your test users can connect. Submit it for verification early, because it can take a few weeks.
3. In **Credentials → Create credentials → OAuth client ID**:
   - Choose **Web application**.
   - Add the authorised redirect URI `https://<your-app>/api/calendar/callback/google`.
4. Set `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`.

## 2. Microsoft (Entra admin center)

1. Go to [entra.microsoft.com](https://entra.microsoft.com) → **App registrations → New registration**.
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (so both Microsoft 365 and Outlook.com work).
   - Redirect URI: platform **Web**, `https://<your-app>/api/calendar/callback/microsoft`.
2. In **Certificates & secrets → New client secret**, copy the **Value** right away, because it is shown once. Note its expiry date, and rotate it before then.
3. In **API permissions → Microsoft Graph → Delegated**, add `Calendars.ReadWrite`, `offline_access`, `openid` and `email`.
4. Set `MICROSOFT_CALENDAR_CLIENT_ID` (the Application/client ID) and `MICROSOFT_CALENDAR_CLIENT_SECRET`.
5. Optional: to allow only your own company's accounts, set `MICROSOFT_CALENDAR_TENANT` to your tenant ID. The default is `common`.

## 3. Server settings and a real test

| Variable | Notes |
|---|---|
| `ENCRYPTION_KEY` | Required. 64 hex characters. Refresh tokens are encrypted with it before they are stored, and never sent to browsers. It is the same key KRA eTIMS uses. Generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | From step 1 |
| `MICROSOFT_CALENDAR_CLIENT_ID` / `_SECRET` | From step 2 |
| `MICROSOFT_CALENDAR_TENANT` | Optional, default `common` |
| `NEXT_PUBLIC_APP_URL` | Must be your real `https://` address, because the redirect URIs are built from it |

You can set up just one provider. Its button appears and the other stays hidden. After redeploying:

1. Go to Profile → Calendar → **Connect Google Calendar**. Approve, and you should land back on Profile showing "Connected to Google Calendar as …".
2. Create a meeting with a teammate and send invites. It should appear in your Google Calendar.
3. Reschedule it, then cancel it. The event should move, then disappear.
4. Add a busy event in Google Calendar, then open the slot finder. That time should no longer be suggested.
5. Repeat with **Connect Outlook**.

## Privacy and access

- OrbitOS stores the account email, encrypted tokens and busy start/end times only. It never stores event titles from people's calendars.
- People can disconnect any time. OrbitOS then revokes the token at Google or Microsoft. Events it already created stay in their calendar.
- If someone revokes access on Google's or Microsoft's side, the next hourly sync notices. Their Profile then asks them to **Connect again**, and invites fall back to email.
