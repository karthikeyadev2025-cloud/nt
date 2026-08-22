import { useCallback, useEffect, useState } from 'react';

/**
 * Keeps the active portal tab in the URL as `?tab=<id>`.
 *
 * Every portal previously held its tab in plain `useState`, which meant:
 *   • refreshing the page silently dumped you back on the first tab,
 *   • no screen in the entire staff area could be linked to or bookmarked
 *     ("open Payroll" had to be described as a click path), and
 *   • the browser/Android back button skipped every tab you'd navigated
 *     through and exited the app instead — the single most disorienting
 *     thing about the portal on mobile, where back is the primary gesture.
 *
 * `?tab=` rather than the hash on purpose: App.tsx routes on `#admin` /
 * `#portal` / `#login`, so putting tab state in the hash would collide with
 * top-level routing.
 *
 * @param validIds  Tab ids the CURRENT user can actually reach. A URL naming
 *                  a tab they lack permission for (a shared link, a stale
 *                  bookmark, a hand-edited URL) falls back instead of
 *                  rendering an empty screen or crashing.
 * @param fallback  Tab to use when the URL names nothing valid.
 */
export function useUrlTab<T extends string>(
  validIds: readonly T[],
  fallback: T,
  param = 'tab',
): [T, (id: T) => void] {
  // validIds is almost always a fresh array literal from a .map() in the
  // caller's render, so depending on the array itself would re-run every
  // effect below on every render. Depend on its CONTENT instead.
  const idsKey = (validIds as readonly string[]).join('|');

  const read = useCallback((): T => {
    if (typeof window === 'undefined') return fallback;
    const v = new URLSearchParams(window.location.search).get(param);
    return v && (validIds as readonly string[]).includes(v) ? (v as T) : fallback;
    // idsKey stands in for validIds — see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, fallback, param]);

  // Initialised from the URL synchronously on first render — deriving it in
  // an effect instead would mount the fallback tab's whole component tree
  // (and fire its queries) before swapping to the requested one.
  const [tab, setTab] = useState<T>(read);

  // Back/forward. Only ever reads the URL — never writes — so a history
  // traversal can't push a new entry and trap the user in a loop.
  useEffect(() => {
    const onPop = () => setTab(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [read]);

  // If permissions load in after mount (hasPermission starts false until the
  // profile arrives), a deep link to a permitted tab would already have been
  // rejected by the first read. Re-check once validIds actually contains it.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(param);
    if (wanted && wanted !== tab && (validIds as readonly string[]).includes(wanted)) {
      setTab(wanted as T);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const navigate = useCallback((id: T) => {
    setTab(id);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set(param, id);
    // pushState (not replaceState) is what makes back step through tabs.
    // Re-selecting the tab you're already on replaces instead, so mashing a
    // nav item doesn't bury the previous screen under duplicate entries.
    if (url.searchParams.get(param) === new URLSearchParams(window.location.search).get(param)) {
      window.history.replaceState({}, '', url);
    } else {
      window.history.pushState({}, '', url);
    }
  }, [param]);

  return [tab, navigate];
}
