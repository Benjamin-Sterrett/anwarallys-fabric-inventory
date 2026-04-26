// Admin gate — "is this email the admin email?"
// Firebase Auth normalizes emails to lowercase server-side; the
// VITE_ADMIN_EMAIL env may be stored with original capitalization. BOTH
// sides MUST be lowercased before compare or valid admins fail to match.
// Fail-closed on missing env, missing email, empty string, or wrong type.
//
// Parity with Rules `isAdminUser()`: this helper checks email ONLY.
// Callers MUST also check `User.emailVerified === true` (see staff.tsx
// route guard). Split keeps this helper trivially testable (PRJ-841).

export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  if (!adminEmail || typeof adminEmail !== 'string') return false;
  if (!email || typeof email !== 'string') return false;
  const candidate = email.trim().toLowerCase();
  const expected = adminEmail.trim().toLowerCase();
  if (candidate === '' || expected === '') return false;
  return candidate === expected;
}
