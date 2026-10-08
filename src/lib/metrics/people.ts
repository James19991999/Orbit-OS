import { MemberWindow, isWithinWorkingHours } from '@/lib/scheduling/time';

export interface CheckInLike { user_id: string; for_date: string; mood: number }
export interface MeetingLike { id: string; starts_at: string; duration_min: number; mode: 'sync' | 'async_first' }
export interface ParticipantLike { meeting_id: string; user_id: string }

export function moodAverage(checkIns: CheckInLike[]): number | null {
  if (!checkIns.length) return null;
  return checkIns.reduce((a, c) => a + c.mood, 0) / checkIns.length;
}

/** Share of (member × working day) slots with a check-in over the window. */
export function checkinRate(checkIns: CheckInLike[], activeMembers: number, days: number): number | null {
  if (!activeMembers || !days) return null;
  const unique = new Set(checkIns.map((c) => `${c.user_id}:${c.for_date}`));
  return Math.min(1, unique.size / (activeMembers * days));
}

export function meetingHoursByUser(meetings: MeetingLike[], participants: ParticipantLike[]): Map<string, number> {
  const dur = new Map(meetings.map((m) => [m.id, m.duration_min / 60]));
  const out = new Map<string, number>();
  for (const p of participants) {
    const h = dur.get(p.meeting_id);
    if (h !== undefined) out.set(p.user_id, (out.get(p.user_id) ?? 0) + h);
  }
  return out;
}

export interface CognitiveLoad {
  meetingHoursPerWeek: number;    // average per member
  asyncShare: number;             // 0..1 share of meetings that are async-first
  deepWorkHoursPerWeek: number;   // avg working hours/week minus meeting hours
}

export function cognitiveLoad(
  meetings: MeetingLike[], participants: ParticipantLike[], members: MemberWindow[], days: number,
): CognitiveLoad {
  const weeks = Math.max(1, days / 7);
  const byUser = meetingHoursByUser(meetings, participants);
  const totalMeeting = [...byUser.values()].reduce((a, b) => a + b, 0);
  const meetingHoursPerWeek = members.length ? totalMeeting / members.length / weeks : 0;
  const workHoursPerWeek = members.length
    ? members.reduce((a, m) => {
        const [sh, sm] = m.workStart.split(':').map(Number);
        const [eh, em] = m.workEnd.split(':').map(Number);
        let h = eh + em / 60 - (sh + sm / 60);
        if (h <= 0) h += 24;
        return a + h * 5;
      }, 0) / members.length
    : 0;
  return {
    meetingHoursPerWeek,
    asyncShare: meetings.length ? meetings.filter((m) => m.mode === 'async_first').length / meetings.length : 0,
    deepWorkHoursPerWeek: Math.max(0, workHoursPerWeek - meetingHoursPerWeek),
  };
}

/** % of member-meeting attendances that fell inside the attendee's working hours. */
export function tzHarmony(meetings: MeetingLike[], participants: ParticipantLike[], members: Map<string, MemberWindow>): number | null {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  let inside = 0; let total = 0;
  for (const p of participants) {
    const m = byId.get(p.meeting_id); const w = members.get(p.user_id);
    if (!m || !w) continue;
    const s = new Date(m.starts_at).getTime();
    total++;
    if (isWithinWorkingHours(w, s, s + m.duration_min * 60_000)) inside++;
  }
  return total ? inside / total : null;
}

/** Members at burnout risk: avg mood ≤ 2 or > 20 meeting hours/week. */
export function burnoutRisk(checkIns: CheckInLike[], hoursByUser: Map<string, number>, memberIds: string[], weeks: number): number {
  if (!memberIds.length) return 0;
  const moods = new Map<string, number[]>();
  for (const c of checkIns) moods.set(c.user_id, [...(moods.get(c.user_id) ?? []), c.mood]);
  const atRisk = memberIds.filter((id) => {
    const m = moods.get(id);
    const avg = m && m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
    const hours = (hoursByUser.get(id) ?? 0) / Math.max(1, weeks);
    return (avg !== null && avg <= 2) || hours > 20;
  });
  return atRisk.length / memberIds.length;
}
