// Shared colour vocabulary for outcome pickers.
//
// The telecaller queue and the field-visit form both ask the same question —
// "what happened?" — and staff move between the two screens. When the same
// meaning wore a different colour on each screen the buttons had to be read
// rather than recognised, which is exactly the "people don't understand what
// things mean" complaint. One map, imported by both catalogs, means a tone
// can only ever mean one thing.
//
// Lives in its own value-only module for the same fast-refresh reason as
// shared-utils.ts and meetings-utils.ts: a file exporting both components and
// plain values forces a full reload of every importer when a value changes.
export const OUTCOME_TONE: Record<string, { idle: string; active: string }> = {
  neutral: { idle: 'border-stone-300 text-stone-700 hover:bg-stone-50', active: 'border-stone-700 bg-stone-700 text-white' },
  amber: { idle: 'border-amber-300 text-amber-800 hover:bg-amber-50', active: 'border-amber-600 bg-amber-600 text-white' },
  emerald: { idle: 'border-emerald-300 text-emerald-800 hover:bg-emerald-50', active: 'border-emerald-600 bg-emerald-600 text-white' },
  blue: { idle: 'border-nikki-border text-nikki-blue hover:bg-nikki-surface-blue', active: 'border-nikki-blue bg-nikki-blue text-white' },
  red: { idle: 'border-red-300 text-red-700 hover:bg-red-50', active: 'border-red-600 bg-red-600 text-white' },
};

// The shape both catalogs satisfy, so one picker can render either.
export type OutcomeOption = {
  readonly value: string;
  readonly label: string;
  readonly note: 'required' | 'optional';
  readonly tone: string;
};
