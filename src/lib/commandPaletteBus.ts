/*
  Lets any part of the page chrome open the command palette without the
  palette having to be prop-drilled through every portal shell.

  Lives outside CommandPalette.tsx for the same fast-refresh reason as
  fuzzyMatch.ts, shared-utils.ts and meetings-utils.ts: a file that exports
  both components and plain values forces a full reload of every importer
  whenever one of those values is edited.
*/
export const OPEN_PALETTE_EVENT = 'nt:open-command-palette';

/** Opens the palette from anywhere — a button, a menu item, a help link. */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}
