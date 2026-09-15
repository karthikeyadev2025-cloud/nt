import type { LucideIcon } from 'lucide-react';

/*
  Pure matching logic for the command palette. Split out of
  CommandPalette.tsx for the same reason shared-utils.ts and
  meetings-utils.ts exist: a file that exports both components and plain
  functions defeats Vite's fast refresh, so editing one of these helpers
  would force a full reload of every component that imports the palette.
*/

export type PaletteItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** The sidebar group it lives under — shown so the result is locatable later. */
  group?: string;
  /** One line on what the screen is for; also searchable. */
  hint?: string;
  /** Extra words people might type for it ("payroll" for HR). */
  keywords?: string;
};

/**
 * Subsequence match, the behaviour people expect from this kind of box:
 * "dupl" and "dl" both find "Duplicate Leads". Returns a score (lower is
 * better) or null when it does not match at all.
 */
export function fuzzyScore(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();

  const exact = h.indexOf(n);
  // A straight substring hit always beats a scattered one, and a hit at the
  // start of the name beats one in the middle.
  if (exact === 0) return 0;
  if (exact > 0) return 1 + exact / 100;

  let hi = 0;
  let score = 10;
  let lastHit = -1;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return null;
    // Reward consecutive characters so "lead" ranks "Leads" over a word
    // that merely contains l, e, a and d somewhere.
    if (lastHit !== -1) score += found - lastHit - 1;
    lastHit = found;
    hi = found + 1;
  }
  return score;
}

export function rankItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map(item => {
      const label = fuzzyScore(item.label, q);
      const other = fuzzyScore(`${item.group || ''} ${item.hint || ''} ${item.keywords || ''}`, q);
      // Secondary text only counts on a real substring hit (score <= 2).
      // A hint is a whole sentence, so a scattered subsequence matches
      // almost anything — "lead" found "Access Control" through the l, e, a
      // and d of "Roles and permissions", which is noise, not a result.
      const secondary = other !== null && other <= 2 ? other + 40 : null;
      const best = label === null ? secondary : label;
      return best === null ? null : { item, best };
    })
    .filter((x): x is { item: PaletteItem; best: number } => x !== null)
    .sort((a, b) => a.best - b.best)
    .map(x => x.item);
}
