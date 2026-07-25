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
