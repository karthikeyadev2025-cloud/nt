import { OUTCOME_TONE, type Outcome } from '../portal/outcomes';

/*
  One control for "what happened?", shared by the telecaller queue, the
  field-visit form and Log Outcome on the leads board.

  It replaced a <select> on all three. A dropdown hides every option until it
  is opened, so choosing an outcome cost a tap to open, a scroll, and a tap to
  pick — on a phone, over a native picker sheet that covers the form you were
  reading. Worse, it hid the vocabulary itself: the field form had no way to
  record "nobody was there" and nobody noticed, because you had to open the
  dropdown to see what was missing. A visible grid shows the whole vocabulary
  at once and costs one tap.

  Buttons are min-h-[44px] because these are the primary targets for staff
  working one-handed, outdoors, on a phone.
*/
export function OutcomePicker({ legend, options, value, onChange }: {
  legend: string;
  options: readonly Outcome[];
  /** '' renders nothing selected — a deliberate choice must be made. */
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = options.find(o => o.value === value);
  return (
    <fieldset>
      <legend className="text-stone-700 text-xs font-semibold mb-1.5">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => {
          const on = value === o.value;
          const tone = OUTCOME_TONE[o.tone];
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${on ? tone.active : tone.idle}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {/* The hint belongs to the chosen outcome, so it sits under the grid
          rather than inside a button that has no room for it. */}
      {selected?.hint && <p className="text-stone-600 text-[11px] mt-1.5 italic">{selected.hint}</p>}
    </fieldset>
  );
}
