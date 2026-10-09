/** English source strings. Keys are grouped by area; {name} placeholders are filled by translate(). */
export const en = {
  // ── WhatsApp replies ──
  'wa.checkin.saved': 'Thanks {name}! Your check-in for {org} is saved. Mood {mood}/5.',
  'wa.checkin.which_org': 'You belong to several workspaces. Reply to a check-in reminder so I know which one this is for.',
  'wa.checkin.no_org': "You're not an active member of a workspace that takes check-ins.",
  'wa.checkin.read_only': '{org} is read-only right now, so the check-in was not saved.',
  'wa.checkin.too_short': 'Tell me a little more about what you shipped (at least a few words).',
  'wa.unknown_number': 'This number is not linked to an OrbitOS account. Link it under Profile → WhatsApp.',
  'wa.help': 'OrbitOS on WhatsApp:\n• Reply to a reminder with what you shipped today. Start with a number 1–5 for your mood, and add "Blockers:" if anything is in your way.\n• Tap Approve or Reject on expense requests.\n• Send STOP to pause messages, START to resume.',
  'wa.stopped': "Done — you won't get check-in reminders or approval requests on WhatsApp. Send START to turn them back on.",
  'wa.started': "You're back on: check-in reminders and approval requests will come here.",
  'wa.expense.approved': 'Approved: {what}. The team can see it in Operations → Finance.',
  'wa.expense.rejected': 'Rejected: {what}.',
  'wa.expense.already_approved': 'That expense was already approved.',
  'wa.expense.already_rejected': 'That expense was already rejected.',
  'wa.expense.forbidden': 'Only owners and directors of the workspace can decide on expenses.',
  'wa.expense.own': "You can't approve your own expense — another owner or director has to.",
  'wa.expense.not_found': 'That expense no longer exists.',
  'wa.expense.read_only': 'The workspace is read-only right now, so nothing was changed.',
  'wa.unsupported': "I can read text messages and button taps. Send HELP to see what I can do.",
} as const;

export type MessageKey = keyof typeof en;
