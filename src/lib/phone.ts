// Normalize Indian phone numbers to a consistent form so duplicate detection
// and lookups match regardless of how the number was typed:
//   "+91 98765-43210", "098765 43210", "9876543210" → "9876543210"
// Keeps the last 10 digits (the subscriber number), dropping +91 / 0 prefixes
// and any spaces, dashes or brackets. Non-standard lengths are returned as the
// stripped digit string so nothing is silently lost.
export function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

// wa.me needs the full international number with no + or leading 0 — this
// business is India-only, so the country code is always 91. Returns null
// for anything that isn't a real 10-digit number (e.g. the "Pending
// Collection" placeholder) so callers can hide the button instead of
// linking to a broken chat.
export function waLink(phone: string, message?: string): string | null {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return null;
  const base = `https://wa.me/91${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
