// Pure helpers and constants used across the Leads/CRM module — split out
// of shared.tsx specifically because it also exports React components, and
// mixing the two in one file defeats Vite's fast-refresh (every edit to a
// plain function here would force a full reload of every component in
// shared.tsx too, not just this one). shared.tsx re-exports all of this so
// every existing `import { X } from './shared'` across the codebase keeps
// working unchanged.

// Postgres/PostgREST errors carry far more than .message — .code (e.g.
// 23514 for a check violation) and .details name the exact constraint,
// which .message alone often doesn't. Every write-path toast in this file
// uses this so a failure is instantly diagnosable from the screen, no
// DevTools required. Also logs the full object to console for anyone who
// does have DevTools open.
export function describeDbError(error: { message: string; code?: string; details?: string | null; hint?: string | null }): string {
  console.error('Supabase write error:', error);
  const parts = [error.message];
  if (error.code) parts.push(`[${error.code}]`);
  if (error.details) parts.push(`— ${error.details}`);
  if (error.hint) parts.push(`(hint: ${error.hint})`);
  return parts.join(' ');
}

// Name shown for a staff member who might have left the company. Data is
// never touched by this — full_name stays exactly what it always was in
// the database; this only changes what's *displayed*, and only to
// viewers without manage_staff/super_admin. HR/Admin always sees the
// real name, since they're the ones who need it for audit purposes.
export type StaffNameInfo = { full_name: string; staff_code?: string | null; employment_status?: string | null };
export function displayStaffName(person: StaffNameInfo | null | undefined, viewerCanSeeReal: boolean): string {
  if (!person) return 'Unknown';
  const departed = person.employment_status && person.employment_status !== 'active';
  if (departed && !viewerCanSeeReal) {
    return `Former Employee${person.staff_code ? ` (${person.staff_code})` : ''}`;
  }
  return person.full_name;
}

// See STAGE_LABELS below — same rationale: DB values stay, rendered
// vocabulary is friendlier. `waiting_customer` was reading as an enum name
// to support agents; `in_progress` looked like a system field.
export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'Working on it',
  waiting_customer: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const ticketStatusLabel = (s: string) => TICKET_STATUS_LABELS[s] ?? s.replace('_', ' ');

// Friendly labels for the stage values shown to staff. DB values stay the
// same (no migration) — only the rendered text changes. Anywhere the UI
// used `stage.replace('_', ' ')` it now uses this map so the vocabulary is
// consistent everywhere and reads like a person talking, not a CRM.
export const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Called',
  qualified: 'Interested',
  quoted: 'Quote Sent',
  won: 'Won',
  lost: 'Lost',
  not_answered: 'Callback later',
};
export const stageLabel = (stage: string) => STAGE_LABELS[stage] ?? stage.replace('_', ' ');

export type Outcome = {
  key: string;
  label: string;
  stage: string;
  callType: 'outgoing' | 'incoming' | 'visit' | 'whatsapp' | 'email' | 'note';
  followupDays: number | null;   // null = no follow-up (deal closed)
  requiresNote?: boolean;
  hint?: string;
};

export const CALL_OUTCOMES: Outcome[] = [
  { key: 'no_answer',        label: 'No answer',              stage: 'not_answered', callType: 'outgoing', followupDays: 1 },
  { key: 'voicemail',        label: 'Left voicemail',         stage: 'contacted',    callType: 'outgoing', followupDays: 1 },
  { key: 'callback_later',   label: 'Asked to call back',     stage: 'not_answered', callType: 'outgoing', followupDays: 2, hint: 'Pick a specific follow-up time below.' },
  { key: 'interested',       label: 'Spoke — interested',     stage: 'qualified',    callType: 'outgoing', followupDays: 3 },
  { key: 'not_interested',   label: 'Spoke — not interested', stage: 'lost',         callType: 'outgoing', followupDays: null, requiresNote: true, hint: 'Say briefly why so we can learn from it.' },
  { key: 'quote_sent',       label: 'Sent quote',             stage: 'quoted',       callType: 'outgoing', followupDays: 7 },
  { key: 'deal_won',         label: 'Deal won 🎉',            stage: 'won',          callType: 'note',     followupDays: null, requiresNote: true },
  { key: 'deal_lost',        label: 'Deal lost',              stage: 'lost',         callType: 'note',     followupDays: null, requiresNote: true, hint: 'Say briefly why so we can learn from it.' },
];

export const VISIT_OUTCOMES: Outcome[] = [
  { key: 'visit_interested',  label: 'Met — interested',      stage: 'qualified', callType: 'visit', followupDays: 3 },
  { key: 'visit_not_interested', label: 'Met — not interested', stage: 'lost',    callType: 'visit', followupDays: null, requiresNote: true },
  { key: 'visit_absent',      label: 'Nobody home',           stage: 'not_answered', callType: 'visit', followupDays: 1 },
  { key: 'visit_quoted',      label: 'Quoted on site',        stage: 'quoted',    callType: 'visit', followupDays: 7 },
  { key: 'visit_won',         label: 'Closed deal on site 🎉', stage: 'won',      callType: 'visit', followupDays: null, requiresNote: true },
];
