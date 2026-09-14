// Shared geolocation helpers. Originally lived only in leads-workflow.tsx's
// field-visit flow; extracted here so shared.tsx's AddLeadModal can use the
// exact same capture behavior without shared.tsx importing from
// leads-workflow.tsx (which already imports FROM shared.tsx — that would be
// a circular import).

// Wall-clock cap on the whole operation, independent of the `timeout`
// option below.
//
// Per the Geolocation spec that option only starts counting once the user
// has ANSWERED the permission prompt. A prompt left sitting on screen —
// tapped away, backgrounded, or suppressed by the browser — fires neither
// callback, so the promise never settled at all. Every caller does
// `setBusy(true); const pos = await getPosition();`, so that hang froze the
// button it gates with no way out but a reload. It is the same failure
// withTimeout() was written for, and geolocation needs its own because it
// is callback-based rather than a promise.
const GEO_HARD_TIMEOUT_MS = 12000;

export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }

    let settled = false;
    const settle = (value: { lat: number; lng: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => settle(null), GEO_HARD_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      p => settle({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => settle(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data?.display_name || '';
  } catch {
    return '';
  }
}
