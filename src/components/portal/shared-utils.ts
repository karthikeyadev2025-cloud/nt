import type { LeadStage } from './outcomes';
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

/**
 * Read-side counterpart to describeDbError.
 *
 * Across this codebase, list loads were written as:
 *
 *     const { data } = await supabase.from('x').select('*');
 *     if (data) setRows(data);
 *
 * The error is discarded, so a refused or failed SELECT returns data: null,
 * setRows is never called, and the screen renders its "nothing here yet"
 * empty state. A permission problem, a dropped connection and a genuinely
 * empty table all look identical to the user — and the empty state actively
 * asserts the wrong one. That single pattern is behind most "it's not
 * showing up in the admin panel" reports.
 *
 * Returns null when there's no error, or a message to show the user.
 * `subject` is the plural noun for the thing being loaded ("applications",
 * "leads", "staff records") so the message reads naturally.
 */
export function describeReadError(
  error: { message: string; code?: string; details?: string | null; hint?: string | null } | null | undefined,
  subject: string,
): string | null {
  if (!error) return null;
  console.error(`Supabase read error loading ${subject}:`, error);
  // 42501 is Postgres insufficient_privilege; PostgREST also surfaces RLS
  // refusals as ordinary messages, hence the text check alongside it.
  const denied = error.code === '42501' || /permission|policy|denied|not allowed/i.test(error.message || '');
  if (denied) {
    return `You don't have permission to view ${subject}. If your account is scoped to specific segments, you'll only see ${subject} for those segments. Ask a super admin to check Access Control.`;
  }
  return `Couldn't load ${subject}: ${error.message}`;
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
  quoted: 'Quote sent',
  won: 'Won',
  lost: 'Lost',
  // Was "Callback later", which named a different thing: a callback is a
  // promise to ring back, and the lead book has callback_at for that. This
  // stage means nobody picked up, and now that "Asked to call back" records
  // contact as made (stage 'contacted'), a lead sitting at not_answered is
  // precisely one that was never reached. It reads the same as the outcome
  // button that produces it.
  not_answered: 'No answer',
};
export const stageLabel = (stage: string) => STAGE_LABELS[stage] ?? stage.replace('_', ' ');

// Board order for the stage buttons and filters. Lives here, beside the
// labels, so anything that needs to name the stages — the leads board, the
// training manual — reads one list instead of retyping it in prose.
export const stages: LeadStage[] = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'not_answered'];

// The outcome catalogs used to live here. They are in outcomes.ts now,
// shared with the telecaller queue and the field-visit form.
