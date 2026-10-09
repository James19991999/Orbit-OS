# AI chief of staff

A short **brief for owners and directors every Monday at 08:00 in their own time zone**, written in their language (English, Kiswahili or French). It covers:
- **Wins:** what people shipped and tasks completed.
- **Risks and blockers:** reported blockers and blocked tasks.
- **People to check in with:** anyone who didn't check in.
- **What's waiting on you:** pending expenses, overdue tasks and failing controls.

It is delivered on the dashboard (**Chief of staff** card), by email, as a notification, and on WhatsApp if linked. From the card you can also **write this week's brief now** or **summarize today's check-ins**.

## Turning it on
It is **off until the workspace owner turns it on** (Dashboard → Chief of staff → *Turn on*). The card explains what is shared. When it's on:
- this workspace's check-in text, task titles and finance totals are sent to **Anthropic (Claude)** to write the brief;
- under Anthropic's commercial terms, API inputs aren't used for training;
- individual moods are never sent by name, only the team average.

Turning it on or off is audited. Add Anthropic as a subprocessor in your privacy policy.

## Setup
```
ANTHROPIC_API_KEY=sk-ant-...        # console.anthropic.com → API keys
ANTHROPIC_MODEL=claude-haiku-5-5    # optional; any current Claude model id
# ANTHROPIC_BASE_URL=               # optional; leave unset for api.anthropic.com
```
Without a key, or if the API call fails, OrbitOS still sends a brief: a rule-based summary built from the same facts, labelled "Automatic summary".

**Cost:** one short request per workspace, per language, per week, plus any "write it now" clicks, which are rate-limited to 6 an hour per person. With Haiku this is a few cents per workspace per month. Check current pricing at anthropic.com/pricing.

The weekly job is `/api/cron/ai-briefs`. It runs hourly from GitHub Actions and sends to each person when their local time is Monday 08:00, once per ISO week.

## Safety
- Team-written text is wrapped in a `<workspace_data>` block, and the model is told to treat it as data and ignore any instructions inside it.
- Output is plain text: Markdown is stripped, and it is HTML-escaped in emails.
- Briefs are readable only by the owners and directors they were written for (row-level security). Contributors and auditors can't see them.
