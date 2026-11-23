/**
 * Normalises a mobile number to 10 digits.
 * Strips spaces, dashes, brackets and a leading +91 / 91 / 0.
 * Returns null if the result is not exactly 10 digits.
 */
export function normalizeMobile(input) {
  if (input == null) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}
