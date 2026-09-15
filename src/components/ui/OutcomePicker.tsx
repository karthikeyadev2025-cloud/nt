import { OUTCOME_TONE, type OutcomeOption } from '../portal/outcome-tone';

/*
  One control for "what happened?", shared by the telecaller queue and the
  field-visit form.

  It replaced a <select> on both screens. A dropdown hides every option until
  it is opened, so choosing an outcome cost a tap to open, a scroll, and a tap
  to pick — on a phone, over a native picker sheet that covers the form you
  were reading. Worse, it hid the fact that options existed at all: the field
  form's "Nobody there" simply was not discoverable behind a closed <select>.
  A visible grid shows the whole vocabulary at once and costs one tap.

  Buttons are min-h-[44px] because these are the primary targets for staff
  working one-handed, outdoors, on a phone.
*/
export function OutcomePicker({ legend, options, value, onChange }: {
  legend: string;
  options: readonly OutcomeOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-stone-700 text-xs font-semibold mb-1.5">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => {
          const selected = value === o.value;
          const tone = OUTCOME_TONE[o.tone];
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={selected}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${selected ? tone.active : tone.idle}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
