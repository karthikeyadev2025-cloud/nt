// Call-outcome catalog for the telecaller queue. Split out of
// leads-workflow.tsx so the rules can be exercised on their own, and for
// the same fast-refresh reason as shared-utils.ts and meetings-utils.ts:
// a file exporting both components and plain values forces a full reload
// of every importer when one of those values changes.

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
export const OUTCOMES = [
  { value: 'not_answered', label: 'No answer', note: 'optional', tone: 'neutral' },
  { value: 'callback', label: 'Call back later', note: 'optional', tone: 'amber' },
  { value: 'contacted', label: 'Spoke — interested', note: 'required', tone: 'emerald' },
  { value: 'appointment', label: 'Appointment booked', note: 'optional', tone: 'blue' },
  { value: 'lost', label: 'Not interested', note: 'required', tone: 'red' },
  { value: 'won', label: 'Converted / closed', note: 'required', tone: 'emerald' },
] as const;


export const OUTCOME_TONE: Record<string, { idle: string; active: string }> = {
  neutral: { idle: 'border-stone-300 text-stone-700 hover:bg-stone-50', active: 'border-stone-700 bg-stone-700 text-white' },
  amber: { idle: 'border-amber-300 text-amber-800 hover:bg-amber-50', active: 'border-amber-600 bg-amber-600 text-white' },
  emerald: { idle: 'border-emerald-300 text-emerald-800 hover:bg-emerald-50', active: 'border-emerald-600 bg-emerald-600 text-white' },
  blue: { idle: 'border-nikki-border text-nikki-blue hover:bg-nikki-surface-blue', active: 'border-nikki-blue bg-nikki-blue text-white' },
  red: { idle: 'border-red-300 text-red-700 hover:bg-red-50', active: 'border-red-600 bg-red-600 text-white' },
};

export function outcomeMeta(value: string) {
  return OUTCOMES.find(o => o.value === value) ?? OUTCOMES[0];
}
