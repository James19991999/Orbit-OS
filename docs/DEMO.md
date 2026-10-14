# Guided demo — a voice that explains OrbitOS

Every signed-in person can play it, to learn the product at their own pace; you can use the same thing for live demos and
LinkedIn videos. Each person only gets the chapters their role can open (for example, contributors skip Finance, Billing and
the Audit log). The closing sales line (“from KES 4,900 a month… the link is in the comments”) plays only for founders
(`FOUNDER_EMAILS`).

## Start
- Press **Ctrl+K** (or click the search box), type **demo**, choose **Play the guided demo**; or choose **Play the guided demo**
  in the Help centre; or open any page with `?demo=1`.
- 17 chapters, in order (use **Next**, or jump with the **Chapters** menu): Dashboard → My day → Projects & Sprints → Team Activity →
  Finance & Runway → Scheduling → Culture → Compliance → Reports → People → Time off → Notifications → Profile → Settings
  (organization, automations, branding, sign-in security, time zones, integrations and eTIMS, data governance, members and roles)
  → Billing → Audit log → Help.
- Open a single **task, invoice, meeting, compliance framework or channel** and the voice explains that page too, then carries on.

## Controls
| Key | Does |
| --- | --- |
| Space | Pause / continue |
| → / ← | Next / previous point |
| M | Voice off (captions keep going) / on |
| H | Hide the controls — only the captions stay, for a clean recording |
| Shift+Esc | End the demo |

The panel also lets you pick the **narration language** (English, Kiswahili, French), the **voice** and the **speed** (0.85×, 1×, 1.15×).
Keys never interfere while you type in a field.

## Best results
- **Use Microsoft Edge on Windows.** Its “Online (Natural)” voices sound human, and it usually has Kenyan voices
  (for example Zuri or Rafiki for Kiswahili, Asilia or Chilemba for Kenyan English). Pick one in the Voice list; it is remembered
  while the tab is open. Chrome works too, with Google voices. If a language has no voice on the computer, captions are shown alone.
- **Captions are always on**, because most LinkedIn viewers watch with the sound off.
- **Live (LinkedIn Live, StreamYard, Zoom, Meet):** share the **browser tab** and tick **“Share tab audio”**, otherwise viewers
  see the captions but don’t hear the voice. Keep your own microphone on to add comments; press Space to pause the voice while you talk.
- **Recorded video (best for LinkedIn posts):** record the tab with OBS Studio or Windows Clipchamp (both free), press **H**
  to hide the controls, and keep each video under 2–3 minutes — for example one video per feature.
- Demo from **your own workspace as owner or director** (finance and approvals are hidden from auditors).
  Add a few realistic tasks, an expense waiting for approval and an invoice first, so every screen has something to show.

## Changing what it says
The script is in `src/lib/demo/script.ts`: one short entry per screen, in English, Kiswahili and French. Keep each line to one
or two sentences, and only describe what is really on the screen. A line can highlight part of the page with a CSS selector.

## On a phone

Phones only allow a page to speak after a tap. Start the demo with a tap (search → “Play the guided demo”, or the Help centre button) and the voice starts at once. If the demo opened on its own (for example after a reload or from a link), a **Tap to hear the voice** button appears under the caption — one tap and the voice starts.

If it is still silent:
- iPhone: turn off the silent switch on the side, and turn the volume up while the demo is playing.
- Open OrbitOS in Chrome or Safari, not inside the WhatsApp, LinkedIn or Instagram in-app browser — those often have no voice.
- Kiswahili voices aren’t installed on every phone; the captions still work, or switch the app to English.
