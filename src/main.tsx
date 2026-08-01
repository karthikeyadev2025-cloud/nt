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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
