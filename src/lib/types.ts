import type { Currency } from './format';
import type { PlanId } from './billing/plans';

export type Role = 'owner' | 'director' | 'contributor' | 'auditor';

export interface Organization {
  id: string; name: string; slug: string; legal_name: string | null; currency: Currency; owner_id: string;
  plan: PlanId; plan_period: 'trial' | 'monthly' | 'annual'; seat_limit: number; plan_expires_at: string;
  status: 'active' | 'suspended' | 'offboarding'; deletion_scheduled_at: string | null;
  sso_domain: string | null; enforce_mfa_admins: boolean; session_timeout_hours: number;
  core_window_start: string; core_window_end: string; golden_overlap_min_hours: number;
  quiet_hours: boolean; auto_detect_timezone: boolean;
  expense_approval_threshold_minor: number; hourly_cost_minor: number; seat_autoscale: boolean; audit_retention_years: number; ai_enabled: boolean; kra_pin: string | null;
  brand_color?: string | null; brand_logo_path?: string | null;
  created_at: string;
}

export interface Profile {
  id: string; email: string | null; full_name: string; avatar_url: string | null; timezone: string;
  work_start: string; work_end: string; city: string | null; country_code: string | null;
  theme: 'system' | 'dark' | 'light'; email_notifications: boolean; checkin_reminders: boolean;
  language: 'en' | 'sw' | 'fr'; data_saver: boolean; whatsapp_checkins: boolean; whatsapp_approvals: boolean; tour_done_at?: string | null;
}

export interface Member {
  user_id: string; role: Role; title: string | null; department: string | null; status: 'active' | 'removed'; created_at: string;
  profile: Profile;
}

export interface Sprint { id: string; org_id: string; name: string; goal: string | null; starts_on: string; ends_on: string; committed_points: number }

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export interface Task {
  id: string; org_id: string; sprint_id: string | null; title: string; description: string | null;
  assignee_id: string | null; created_by: string | null; priority: Priority; status: TaskStatus; points: number;
  due_on: string | null; tags: string[]; blocked_reason: string | null; external_ref: string | null;
  completed_at: string | null; created_at: string;
}

export interface FinanceEntry {
  id: string; org_id: string; kind: 'cash_balance' | 'expense' | 'revenue' | 'payroll'; amount_minor: number; currency: Currency;
  category: string | null; vendor: string | null; occurred_on: string; note: string | null;
  approval_status: 'pending' | 'approved' | 'rejected'; approved_by: string | null; created_by: string | null; created_at: string;
}

export interface Invoice {
  id: string; org_id: string; number: string; client_name: string; client_email: string; description: string | null;
  amount_minor: number; currency: Currency; terms_days: number; issued_on: string; due_on: string;
  status: 'draft' | 'sent' | 'paid' | 'void'; payment_url: string | null; paid_at: string | null; created_at: string; created_by: string | null;
  client_kra_pin: string | null;
}

export interface PayrollRun { id: string; period: string; country_count: number; total_minor: number; currency: Currency; provider_label: string; status: 'recorded' | 'settled'; paid_on: string | null }

export interface Meeting {
  id: string; org_id: string; title: string; description: string | null; starts_at: string; duration_min: number;
  organizer_id: string; mode: 'sync' | 'async_first'; loom_url: string | null; video_url: string | null; created_at: string;
}
export interface MeetingParticipant { meeting_id: string; user_id: string; rsvp: 'pending' | 'yes' | 'no' | 'maybe' }

export interface CheckIn { id: string; user_id: string; for_date: string; shipped: string; blockers: string | null; mood: number; created_at: string }
export interface Channel { id: string; slug: string; name: string; topic: string | null; is_announcement: boolean }
export interface Message { id: string; channel_id: string; author_id: string; parent_id: string | null; body: string; pinned: boolean; edited_at: string | null; created_at: string; org_id: string }
export interface Poll { id: string; question: string; anonymous: boolean; closes_at: string | null; kind: 'pulse' | 'announcement' | 'enps'; created_at: string }
export interface PollOption { id: string; poll_id: string; label: string; position: number }
export type Badge = 'firefighter' | 'team_glue' | 'ship_it' | 'innovator';
export interface Kudos { id: string; from_id: string; to_id: string; badge: Badge; message: string; created_at: string }
export interface Lounge { id: string; name: string; description: string | null; kind: 'hangout' | 'focus'; focus_minutes: number; break_minutes: number; rounds: number; session_started_at: string | null; room_code: string }

export type ControlStatus = 'passing' | 'failing' | 'in_review' | 'not_started' | 'not_applicable';
export interface Framework { id: string; key: 'soc2' | 'gdpr' | 'iso27001' | 'hipaa' | 'custom'; name: string; description: string | null; target_date: string | null; policy_version: string | null }
export interface Control { id: string; framework_id: string; ref: string; title: string; owner_id: string | null; status: ControlStatus; last_reviewed_at: string | null; notes: string | null }
export interface Evidence { id: string; control_id: string; file_path: string; file_name: string; uploaded_by: string | null; valid_until: string | null; created_at: string }
export interface Device { id: string; owner_id: string | null; name: string; os: string; encrypted: boolean; agent_installed: boolean; last_seen_on: string | null }
export interface Dsar { id: string; requester_email: string; type: 'access' | 'erasure' | 'rectification' | 'portability'; status: 'open' | 'in_progress' | 'closed'; due_on: string; created_at: string }
export interface TrainingCampaign { id: string; title: string; due_on: string }
export interface TrainingAssignment { campaign_id: string; user_id: string; completed_at: string | null; last_reminded_at: string | null }
export interface VaultDoc { id: string; title: string; category: 'nda' | 'ip' | 'contract' | 'other'; file_path: string; created_at: string }

export interface Notification { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface AuditEntry { id: number; created_at: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; ip: string | null }
export interface ReportSchedule { id: string; name: string; cadence: 'weekly' | 'monthly'; weekday: number | null; month_day: number | null; hour_utc: number; destination: 'email' | 'slack'; recipients: string[]; enabled: boolean; last_run_at: string | null; last_status: string | null }
export interface BillingPayment { id: string; created_at: string; plan: PlanId; period: 'monthly' | 'annual'; seats: number; amount_minor: number; currency: Currency; method: 'MPESA' | 'CARD'; api_ref: string; state: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED'; period_start: string | null; period_end: string | null }
export interface LegalEntity { id: string; name: string; jurisdiction: string; entity_type: string | null; hub_label: string | null; is_primary: boolean }
export interface Integration { id: string; kind: 'slack_webhook' | 'github'; enabled: boolean; config: Record<string, unknown> }
