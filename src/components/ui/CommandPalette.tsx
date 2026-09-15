import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { ModalOverlay } from './Modal';
import { rankItems, type PaletteItem } from '../../lib/fuzzyMatch';
import { OPEN_PALETTE_EVENT, openCommandPalette } from '../../lib/commandPaletteBus';

/*
  "Jump to anything" — one keystroke to reach any screen the signed-in user
  can actually see.

  The reason this exists: an admin has 25 screens and a telecaller about 10,
  spread across a grouped sidebar and several dropdown menus. Reaching HR →
  Payroll or Duplicate Leads meant remembering which group it lives under,
  opening that group, then reading down the list — every time. People who
  use the portal all day learn the paths; everyone else hunts. This turns
  "where is that screen" into typing the first three letters of its name.

  Deliberately role-aware rather than a fixed menu: it is handed the same
  already-filtered tab list the sidebar renders, so it can never offer a
  screen the user would be refused on arrival.
*/

/**
 * The visible way in. Shows as a search-style control on desktop (wide
 * enough to read as "you can search here", with the shortcut spelled out so
 * people learn it) and collapses to a labelled icon button on phones, where
 * header space is scarce and there is no keyboard shortcut to fall back on.
 */
export function CommandPaletteButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-keyshortcuts="Control+K"
      aria-label="Jump to a screen"
      title="Jump to a screen (Ctrl+K)"
      className={`icon-btn gap-2 rounded-xl border border-nikki-border text-stone-600 hover:border-stone-300 hover:bg-stone-50 transition-colors
                  p-2 sm:px-3 sm:py-1.5 sm:min-w-[9.5rem] sm:justify-start ${className}`}
    >
      <Search aria-hidden="true" className="w-4 h-4 shrink-0" />
      <span className="hidden sm:inline text-xs font-medium">Jump to…</span>
      <kbd className="hidden md:inline ml-auto text-[11px] font-semibold border border-nikki-border rounded px-1.5 py-0.5">Ctrl K</kbd>
    </button>
  );
}

export function CommandPalette({
  items,
  onSelect,
  activeId,
}: {
  items: PaletteItem[];
  onSelect: (id: string) => void;
  activeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => rankItems(items, query), [items, query]);

  // Ctrl/Cmd-K from anywhere. Also "/" — the shortcut people try first when
  // they have not been told there is one — but only when they are not
  // already typing into a field, or it would swallow the slash.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' || target.isContentEditable
      );
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    // A visible button elsewhere in the page chrome opens it through this
    // event. Without it the palette was keyboard-only — undiscoverable for
    // anyone not told the shortcut, and flatly unusable for the telecallers
    // and field executives who work from a phone and have no Ctrl key.
    function onOpenRequest() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  useEffect(() => { setCursor(0); }, [query]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-cursor="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results]);

  const choose = useCallback((id: string) => {
    onSelect(id);
    setOpen(false);
  }, [onSelect]);

  if (!open) return null;

  return (
    <ModalOverlay
      className="fixed inset-0 z-[110] bg-nikki-navy/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]"
      onClose={() => setOpen(false)}
      label="Jump to a screen"
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-nikki-border overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-nikki-border">
          <Search aria-hidden="true" className="w-4 h-4 text-stone-500 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); choose(results[cursor].id); }
            }}
            placeholder="Jump to a screen — type a name"
            aria-label="Jump to a screen"
            className="flex-1 py-3.5 text-sm text-nikki-navy bg-transparent border-none focus:outline-none focus:ring-0 placeholder-stone-500"
          />
          <kbd className="hidden sm:inline text-[11px] font-semibold text-stone-500 border border-nikki-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="text-stone-600 text-sm text-center py-8">
              Nothing matches “{query}”. Try part of the screen’s name.
            </p>
          )}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                data-cursor={i === cursor ? 'true' : undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(r.id)}
                aria-current={r.id === activeId ? 'page' : undefined}
                className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-colors ${
                  i === cursor ? 'bg-nikki-surface-blue' : 'hover:bg-stone-50'
                }`}
              >
                {Icon && <Icon aria-hidden="true" className={`w-4 h-4 mt-0.5 shrink-0 ${i === cursor ? 'text-nikki-blue' : 'text-stone-600'}`} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-nikki-navy text-sm font-semibold truncate">{r.label}</span>
                    {r.group && <span className="text-stone-500 text-[11px] shrink-0">{r.group}</span>}
                    {r.id === activeId && <span className="text-nikki-blue text-[11px] font-bold shrink-0">current</span>}
                  </span>
                  {r.hint && <span className="block text-stone-600 text-[11px] mt-0.5 truncate">{r.hint}</span>}
                </span>
                {i === cursor && <CornerDownLeft aria-hidden="true" className="w-3.5 h-3.5 text-nikki-blue shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Keyboard hints only where there is a keyboard. On a phone this
            footer was advertising "ctrl+k or / anytime" to someone who has
            neither key — noise at best, confusing at worst. Touch users get
            the one instruction that applies to them instead. */}
        <p className="px-4 py-2 border-t border-nikki-border bg-stone-50 text-stone-600 text-[11px]">
          <span className="hidden sm:inline">
            <kbd className="font-semibold">↑</kbd> <kbd className="font-semibold">↓</kbd> to move ·
            <kbd className="font-semibold"> enter</kbd> to open ·
            <kbd className="font-semibold"> ctrl</kbd>+<kbd className="font-semibold">k</kbd> or <kbd className="font-semibold">/</kbd> anytime
          </span>
          <span className="sm:hidden">Tap a screen to open it</span>
        </p>
      </div>
    </ModalOverlay>
  );
}
