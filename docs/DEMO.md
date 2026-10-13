# Demo mode — a voice that explains OrbitOS while you share your screen

Only accounts listed in `FOUNDER_EMAILS` can use it. Customers never see it.

## Start
- Press **Ctrl+K** (or click the search box), type **demo**, choose **Start demo mode** — or open any page with `?demo=1`.
- Open the screens in this order and the voice explains each one; at the end of each screen a **Next** button takes you on:
  Dashboard → My day → Projects & Sprints → Finance & Runway → Scheduling → Culture → Time off → Settings (Automations) → Help.
- The last line gives the price (from KES 4,900 a month), the 14-day free trial and “the link is in the comments”.

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
