import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Aggressively clean up any stale service worker or cache from a previous build.
//
// This deliberately does more than just unregister():
//   • Unregisters every SW currently registered for this origin
//   • Deletes EVERY cache in the Cache Storage API
//
// Why: a previous build shipped a caching service worker (public/sw.js). Once a
// browser installed it, it stayed installed even across builds — and its
// `fetch` handler cached every same-origin GET (including old JS bundles and
// old index.html). After a login/sign-out cycle in that tab, the app would
// often start serving stale cached bundles, get into an inconsistent state
// with the current auth flow, and appear "frozen" or "dead" on refresh —
// while a fresh browser session (no SW installed) worked fine. That matches
// the reported symptom exactly.
//
// Plain unregister() by itself is NOT enough here: browsers keep the Cache
// Storage contents even after the SW is unregistered, so a stale bundle
// could still be served from cache on the very next fetch. We must delete
// the caches too.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister().catch(() => {}))))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k).catch(() => {}))))
        .catch(() => {});
    }
  });
}

// Automatic stale-version detection. On load, and again whenever the tab
// becomes visible, check whether a newer build has been deployed since this
// page loaded — if so, purge everything and reload automatically. This
// exists specifically so nobody ever has to manually clear their browser's
// cache after a deploy again: the app detects it's stale and fixes itself.
(function watchForNewDeploy() {
  // Never in dev. There are no deploys to detect there (Vite's HMR handles
  // code changes), and the check cannot do anything BUT misfire: vite.config
  // sets __BUILD_ID__ to Date.now() at config load, while the dev server
  // serves public/build-version.json verbatim as {"buildId": "dev"}. Those
  // two can never be equal, so every dev page load concluded it was stale
  // and called location.reload() — which loaded the page, which concluded it
  // was stale, which reloaded. Measured at 135 navigations in 10 seconds,
  // i.e. `npm run dev` was unusable in a browser and impossible to automate.
  //
  // vite build writes dist/build-version.json with the SAME id it compiles
  // into the bundle, so the production path is unaffected and still catches
  // a genuinely stale tab after a real deploy.
  if (import.meta.env.DEV) return;

  let reloading = false;

  async function checkForNewVersion() {
    if (reloading || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`/build-version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) return;
      const { buildId } = await res.json();
      if (buildId && typeof __BUILD_ID__ !== 'undefined' && buildId !== __BUILD_ID__) {
        reloading = true;
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
          await Promise.all(regs.map(r => r.unregister().catch(() => {})));
        }
        if ('caches' in window) {
          const keys = await caches.keys().catch(() => [] as string[]);
          await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
        }
        window.location.reload();
      }
    } catch {
      // Network hiccup checking for updates.
    }
  }

  checkForNewVersion();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForNewVersion();
  });
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
