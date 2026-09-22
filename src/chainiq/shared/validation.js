/**
 * Returns true when the string looks like a valid email address.
 * Empty/null strings return false - callers that treat email as optional
 * should skip this check when the field is blank.
 */
export function isEmailValid(email) {
  if (!email || !email.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
