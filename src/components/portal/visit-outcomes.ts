import type { OutcomeOption } from './outcome-tone';

/*
  Field-visit outcome catalog, ordered by how often an executive actually
  picks it rather than by pipeline tidiness.

  Two options here did not exist before, and both absences were forcing
  wrong data into the lead book:

  • "Nobody there" — the single most common result of driving to a customer
    site. The old picker offered nothing for it, so the executive had to
    choose "Follow-up needed", which writes stage = 'contacted': the record
    then claims the customer was spoken to. `not_answered` is a real stage
    in the schema and every report already understands it; the form was
    simply never given a way to say it.

  • "Quoted on site" — `quoted` is likewise a real stage, and it is the one
    the funnel counts as a genuine quote. A field executive who priced the
    job on the spot had to log "Interested — quoting" (stage = 'qualified'),
    so quotes raised in the field never appeared as quotes at all.

  `value` IS the stage written to marketing_leads.stage, so every entry here
  must be one of the schema's CHECK values:
    new | contacted | qualified | quoted | won | lost | not_answered

  `note` says whether a typed remark is genuinely required. Every outcome
  used to require one. That is right when the note is the only record of
  something nobody can reconstruct later, and wrong for "nobody was there" —
  there is nothing to write, so a hard block just teaches people to type "."
  or, worse, to pick an outcome that does not need a note. Same reasoning as
  the telecaller catalog.
*/
export const VISIT_OUTCOME_OPTIONS: readonly OutcomeOption[] = [
  { value: 'not_answered', label: 'Nobody there', note: 'optional', tone: 'neutral' },
  { value: 'contacted', label: 'Met — follow up later', note: 'required', tone: 'amber' },
  { value: 'qualified', label: 'Met — interested', note: 'required', tone: 'emerald' },
  { value: 'quoted', label: 'Quoted on site', note: 'required', tone: 'blue' },
  { value: 'lost', label: 'Not interested', note: 'required', tone: 'red' },
  { value: 'won', label: 'Closed — won on site', note: 'required', tone: 'emerald' },
] as const;

export function visitOutcomeMeta(value: string): OutcomeOption {
  return VISIT_OUTCOME_OPTIONS.find(o => o.value === value) ?? VISIT_OUTCOME_OPTIONS[0];
}
