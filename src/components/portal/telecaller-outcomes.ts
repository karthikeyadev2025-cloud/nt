// Call-outcome catalog for the telecaller queue. Split out of
// leads-workflow.tsx so the rules can be exercised on their own, and for
// the same fast-refresh reason as shared-utils.ts and meetings-utils.ts:
// a file exporting both components and plain values forces a full reload
// of every importer when one of those values changes.

import type { OutcomeOption } from './outcome-tone';

/*
  Call outcomes, ordered by how often a telecaller actually picks them
  rather than by workflow tidiness — "Not Answered" is the most common
  result of a dial by a wide margin, so it sits in the first row.

  `note` says whether a typed remark is genuinely required:
    'required' — the note IS the information, and nobody else can
                 reconstruct it later ("what did they say?", "why not
                 interested?").
    'optional' — the outcome plus its date already carry the information.
                 Forcing a note here bought nothing: with a hard block on
                 save, the rational move for "nobody picked up" is to type
                 "." or "na", so the field filled up with noise — or the
                 caller skipped logging altogether, which is worse, because
                 an unlogged Not Answered never releases the lead back to
                 the pool for someone else to try.
  When nothing is typed the stored remark is just the bracketed tag —
  "[No answer]" — which already reads as a complete statement.
*/
export const OUTCOMES: readonly OutcomeOption[] = [
  { value: 'not_answered', label: 'No answer', note: 'optional', tone: 'neutral' },
  { value: 'callback', label: 'Call back later', note: 'optional', tone: 'amber' },
  { value: 'contacted', label: 'Spoke — interested', note: 'required', tone: 'emerald' },
  { value: 'appointment', label: 'Appointment booked', note: 'optional', tone: 'blue' },
  { value: 'lost', label: 'Not interested', note: 'required', tone: 'red' },
  { value: 'won', label: 'Converted / closed', note: 'required', tone: 'emerald' },
] as const;


export function outcomeMeta(value: string): OutcomeOption {
  return OUTCOMES.find(o => o.value === value) ?? OUTCOMES[0];
}
