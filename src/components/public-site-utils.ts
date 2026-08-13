// A phone number is only "real" once it has actual digits — the seeded
// placeholder (+91 00000 00000) must never be shown to a customer.
export function hasRealPhone(v?: string) {
  if (!v) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 10 && !/^0+$/.test(digits.slice(2));
}
