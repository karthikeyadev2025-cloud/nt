/*
  The outcome vocabulary — one catalog, used by every screen that asks
  "what happened?".

  There used to be three, and they disagreed:

    • the telecaller queue      (6 call outcomes)
    • the field-visit form      (4, then 6, visit outcomes)
    • Log Outcome on the leads  (8 call outcomes + 5 visit outcomes)
      board, which every manager
      and admin dashboard uses

  The disagreements were not cosmetic. "Spoke — interested" wrote
  stage = 'contacted' from the telecaller queue and stage = 'qualified'
  from the leads board, so the same call recorded a different funnel
  position depending only on which screen the caller happened to use, and
  the conversion numbers moved with it. Telecallers had no way to log
  "Left voicemail" or "Sent quote"; the leads board had no "Appointment
  booked"; the same terminal outcome was called "Converted / closed" on
  one screen and "Deal won" on another.

  Per the business owner: interested means qualified.

  Anything a screen needs to know about an outcome lives here, so a screen
  can never again quietly mean something different by the same words.
*/

// The stage values the marketing_leads CHECK constraint allows. Kept as a
// union so a typo in a catalog entry is a compile error rather than a 400
// at save time — on a doorstep, offline.
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost' | 'not_answered';

export type Outcome = {
  /** Catalog key. Never written to the database — `stage` is. */
  readonly value: string;
  readonly label: string;
  /** What this outcome means for the lead's position in the funnel. */
  readonly stage: LeadStage;
  /** lead_remarks.call_type, so the activity feed can filter by it. */
  readonly callType: 'outgoing' | 'visit' | 'note';
  /**
   * Whether a typed note is genuinely required.
   *
   * 'required' — the note IS the information and nobody can reconstruct it
   *              later ("what did they say?", "why not interested?").
   * 'optional' — the outcome and its date already say everything. Demanding
   *              a note here bought nothing: faced with a hard block, the
   *              rational move for "nobody picked up" is to type "." — or
   *              to skip logging, which is worse, because an unlogged No
   *              Answer never releases the lead for someone else to try.
   */
  readonly note: 'required' | 'optional';
  readonly tone: 'neutral' | 'amber' | 'emerald' | 'blue' | 'red';
  /** Default days until the next touch, for screens that offer one. null = closed. */
  readonly followupDays: number | null;
  /** This outcome is only complete once a date is picked. */
  readonly schedules?: 'callback' | 'appointment';
  readonly hint?: string;
};

export const CALL_OUTCOMES: readonly Outcome[] = [
  { value: 'no_answer', label: 'No answer', stage: 'not_answered', callType: 'outgoing',
    note: 'optional', tone: 'neutral', followupDays: 1 },
  { value: 'callback', label: 'Asked to call back', stage: 'contacted', callType: 'outgoing',
    note: 'optional', tone: 'amber', followupDays: 2, schedules: 'callback',
    hint: 'Someone answered and asked for a later time, so this counts as contact made.' },
  { value: 'voicemail', label: 'Left voicemail', stage: 'contacted', callType: 'outgoing',
    note: 'optional', tone: 'neutral', followupDays: 1 },
  { value: 'interested', label: 'Spoke — interested', stage: 'qualified', callType: 'outgoing',
    note: 'required', tone: 'emerald', followupDays: 3 },
  { value: 'appointment', label: 'Appointment booked', stage: 'qualified', callType: 'outgoing',
    note: 'optional', tone: 'blue', followupDays: null, schedules: 'appointment' },
  { value: 'quote_sent', label: 'Sent quote', stage: 'quoted', callType: 'outgoing',
    note: 'required', tone: 'blue', followupDays: 7 },
  { value: 'not_interested', label: 'Not interested', stage: 'lost', callType: 'outgoing',
    note: 'required', tone: 'red', followupDays: null,
    hint: 'Say briefly why, so we can learn from it.' },
  { value: 'won', label: 'Deal won', stage: 'won', callType: 'outgoing',
    note: 'required', tone: 'emerald', followupDays: null },
];

export const VISIT_OUTCOMES: readonly Outcome[] = [
  { value: 'visit_absent', label: 'Nobody there', stage: 'not_answered', callType: 'visit',
    note: 'optional', tone: 'neutral', followupDays: 1 },
  { value: 'visit_followup', label: 'Met — follow up later', stage: 'contacted', callType: 'visit',
    note: 'required', tone: 'amber', followupDays: 3 },
  { value: 'visit_interested', label: 'Met — interested', stage: 'qualified', callType: 'visit',
    note: 'required', tone: 'emerald', followupDays: 3 },
  { value: 'visit_quoted', label: 'Quoted on site', stage: 'quoted', callType: 'visit',
    note: 'required', tone: 'blue', followupDays: 7 },
  { value: 'visit_not_interested', label: 'Met — not interested', stage: 'lost', callType: 'visit',
    note: 'required', tone: 'red', followupDays: null,
    hint: 'Say briefly why, so we can learn from it.' },
  { value: 'visit_won', label: 'Closed — won on site', stage: 'won', callType: 'visit',
    note: 'required', tone: 'emerald', followupDays: null },
];

/** Defaults each screen starts on. Named so a rename cannot silently break them. */
export const DEFAULT_CALL_OUTCOME = 'interested';
export const DEFAULT_VISIT_OUTCOME = 'visit_followup';

export function callOutcome(value: string): Outcome {
  return CALL_OUTCOMES.find(o => o.value === value) ?? CALL_OUTCOMES[0];
}

export function visitOutcome(value: string): Outcome {
  return VISIT_OUTCOMES.find(o => o.value === value) ?? VISIT_OUTCOMES[0];
}

/**
 * Terminal or no-contact outcomes hand the lead back to the unassigned pool.
 * "Interested" and callbacks stay with whoever is working them, so a lead
 * never vanishes into a pool that restricted staff cannot see.
 */
export function releasesToPool(o: Outcome): boolean {
  return o.stage === 'won' || o.stage === 'lost' || o.stage === 'not_answered';
}

export function isClosed(o: Outcome): boolean {
  return o.stage === 'won' || o.stage === 'lost';
}

/**
 * Remark prefixes that have ever meant "this lead converted".
 *
 * The telecaller's monthly conversion counter matches on remark TEXT
 * (`ilike '[Converted / Closed]%'`), because a won lead is released to the
 * pool and so cannot be attributed through assigned_to. That makes a label
 * rename a silent data bug: change the words and the number quietly drops to
 * zero, with nothing failing. Every historical wording therefore has to stay
 * listed here, and the query has to read this list rather than a literal.
 */
export const WON_REMARK_PREFIXES: readonly string[] = [
  'Deal won',            // current
  'Converted / Closed',  // leads board, before unification
  'Converted / closed',  // telecaller queue, before unification
  'Deal won 🎉',         // leads board, earlier still
];

/**
 * Colour vocabulary. One map for both catalogs, so a colour cannot come to
 * mean one thing on the call screen and another on the visit screen.
 */
export const OUTCOME_TONE: Record<Outcome['tone'], { idle: string; active: string }> = {
  neutral: { idle: 'border-stone-300 text-stone-700 hover:bg-stone-50', active: 'border-stone-700 bg-stone-700 text-white' },
  amber: { idle: 'border-amber-300 text-amber-800 hover:bg-amber-50', active: 'border-amber-600 bg-amber-600 text-white' },
  emerald: { idle: 'border-emerald-300 text-emerald-800 hover:bg-emerald-50', active: 'border-emerald-600 bg-emerald-600 text-white' },
  blue: { idle: 'border-nikki-border text-nikki-blue hover:bg-nikki-surface-blue', active: 'border-nikki-blue bg-nikki-blue text-white' },
  red: { idle: 'border-red-300 text-red-700 hover:bg-red-50', active: 'border-red-600 bg-red-600 text-white' },
};
