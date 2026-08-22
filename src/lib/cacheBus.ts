import { invalidateQueryCache, clearQueryCache } from './cachedQuery';
import { invalidateRpcCache, clearRpcCache } from './cachedRpc';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONE place that knows which cache keys a given kind of write invalidates.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Both cachedQuery and cachedRpc hold results for 5 minutes by default and
 * back them up to sessionStorage. That is fine for reads — but every write
 * path in the app was calling its own `load()` straight after a save, and
 * `load()` goes through the same cache. The cache happily returned the
 * pre-save rows, so the save looked like it silently failed: new staff
 * didn't appear, edited segments didn't change, a closed ticket stayed
 * open, check-in didn't register. The data was always correct in Postgres;
 * only the client was lying.
 *
 * Two things made this hard to fix piecemeal:
 *
 *  1. Cache keys are string literals scattered across ~15 files, so the
 *     writer and the reader had no way to stay in sync. `hr_staff_users`
 *     vs `hr_app_users` had already drifted apart unnoticed.
 *  2. cachedQuery and cachedRpc each exported a function called
 *     `invalidateQueryCache` operating on a *different* cache, so getting
 *     the import wrong silently no-oped.
 *
 * So: keys live here, grouped by the domain concept that changes, and
 * `invalidate()` always clears both caches. A write site names what it
 * changed ("staff") rather than reciting key strings it can't verify.
 */

export const CACHE_GROUPS = {
  /** Any change to an app_users row: onboarding, edits, role/segment
   *  changes, offboarding, promotions, profile photo, bank details. */
  staff: [
    'access_control_users',
    'hr_app_users',
    'staff_users_summary',
    'active_staff_users_full',
    'marketing_executives',
    'marketing_execs_summary',
    'all_staff_names_for_display',
    'role_permissions_overview',
    'punctuality_leaderboard_30d',
    'today_birthdays_celebrations',
    'setup_checklist_counts',
    'get_segment_summary',
    'get_dashboard_counts',
  ],
  /** segments table: create, edit, retire/reactivate. */
  segments: [
    'app_segments',
    'get_segment_summary',
    'setup_checklist_counts',
    'leads_funnel_chart_data',
  ],
  leads: [
    'leads:',
    'appointments:',
    'telecaller_queue',
    'telecaller_stats',
    'my_todo',
    'leads_funnel_chart_data',
    'sourcing_funnel',
    'get_dashboard_counts',
    'get_segment_summary',
  ],
  tickets: [
    'tickets:',
    'ticket_status_chart_data',
    'list_overdue_tickets',
    'get_dashboard_counts',
    'get_segment_summary',
  ],
  tasks: ['tasks:'],
  attendance: [
    'my_attendance',
    'attendance:',
    'attendance_trend_chart_14d',
    'staff_attendance_summary',
    'punctuality_leaderboard_30d',
    'regularizations',
    'regularization_approvals_data',
    'list_dangling_checkins',
    'my_stats',
  ],
  /** Leave requests, salary advances, shift swaps, bank/photo requests. */
  requests: [
    'my_requests',
    'leave_requests',
    'salary_advance_requests',
    'get_leave_balances',
    'regularization_approvals_data',
  ],
  payroll: ['payslip_manager_data', 'shifts_manager_data'],
  shifts: ['shifts_manager_data', 'staff_attendance_summary'],
  holidays: ['holidays_list'],
  documents: ['emp_docs:'],
  notifications: ['notifications:'],
  announcements: ['announcements_feed'],
  meetings: ['list_meetings'],
  /** Public-website content and catalog: site_content, products, services,
   *  gallery, team, testimonials, job postings. */
  siteContent: ['site_content_data', 'announcements_feed'],
} as const;

export type CacheGroup = keyof typeof CACHE_GROUPS;

/**
 * Invalidate every key belonging to the named groups, in BOTH caches.
 * Call this after a successful write, before re-loading.
 *
 *   await supabase.from('app_users').update(...)
 *   invalidate('staff');
 *   load();
 */
export function invalidate(...groups: CacheGroup[]) {
  const prefixes = new Set<string>();
  for (const g of groups) for (const k of CACHE_GROUPS[g]) prefixes.add(k);
  for (const p of prefixes) {
    invalidateQueryCache(p);
    invalidateRpcCache(p);
  }
}

/** Invalidate raw key prefixes — escape hatch for one-off keys that don't
 *  warrant a group. Prefer invalidate() so keys stay discoverable. */
export function invalidateKeys(...prefixes: string[]) {
  for (const p of prefixes) {
    invalidateQueryCache(p);
    invalidateRpcCache(p);
  }
}

/**
 * Full wipe of every cached row, memory and sessionStorage. Used at sign-in
 * and sign-out: cached rows are scoped to whoever fetched them, and
 * sessionStorage survives the same-tab navigation signOut performs, so
 * without this the next person to sign in on a shared machine hydrates the
 * previous user's data (staff list including salary_structure, payslips,
 * HR records) before their own RLS-scoped fetches return.
 */
export function clearAllCaches() {
  clearQueryCache();
  clearRpcCache();
}
