/** RFC 5545 calendar invite builder (used for emailed invites + "Add to calendar" downloads). */
export interface IcsEvent {
  uid: string; title: string; description?: string | null; start: Date; durationMin: number; url?: string | null;
  organizer?: { name: string; email: string } | null; attendees?: { name: string; email: string }[]; method?: 'REQUEST' | 'PUBLISH' | 'CANCEL';
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** Lines longer than 75 octets must be folded (RFC 5545 §3.1). */
export function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += i === 0 ? 75 : 74) parts.push((i === 0 ? '' : ' ') + line.slice(i, i + (i === 0 ? 75 : 74)));
  return parts.join('\r\n');
}

export function buildIcs(e: IcsEvent, now = new Date()): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OrbitOS//Scheduling//EN', 'CALSCALE:GREGORIAN', `METHOD:${e.method ?? 'REQUEST'}`,
    'BEGIN:VEVENT', `UID:${e.uid}@orbitos`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description || e.url ? [`DESCRIPTION:${icsEscape([e.description, e.url ? `Join: ${e.url}` : ''].filter(Boolean).join('\n\n'))}`] : []),
    ...(e.url ? [`LOCATION:${icsEscape(e.url)}`, `URL:${e.url}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${icsEscape(e.organizer.name)}:mailto:${e.organizer.email}`] : []),
    ...(e.attendees ?? []).map((a) => `ATTENDEE;CN=${icsEscape(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${e.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(e: Pick<IcsEvent, 'title' | 'description' | 'start' | 'durationMin' | 'url'>): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: e.title, dates: `${stamp(e.start)}/${stamp(end)}`,
    details: [e.description, e.url ? `Join: ${e.url}` : ''].filter(Boolean).join('\n\n'),
    ...(e.url ? { location: e.url } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function jitsiUrl(orgSlug: string, meetingId: string) {
  return `https://meet.jit.si/orbitos-${orgSlug}-${meetingId.slice(0, 8)}`;
}
