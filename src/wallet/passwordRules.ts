export const PAYMENT_PASSWORD_MIN_LENGTH = 8;
export const PAYMENT_PASSWORD_MAX_LENGTH = 16;

type PaymentPasswordRuleKey =
  | 'form.payPasswordMinLength'
  | 'form.payPasswordMaxLength'
  | 'form.payPasswordTooSimple';

/** "11111111", "12345678", "87654321" and the like: one repeated char or a pure run. */
function isTriviallyGuessable(password: string): boolean {
  const codes = Array.from(password, (ch) => ch.charCodeAt(0));
  const step = codes[1] - codes[0];
  if (step !== 0 && Math.abs(step) !== 1) return false;
  return codes.every((code, i) => i === 0 || code - codes[i - 1] === step);
}

/**
 * Payment password rules for creating or changing the password:
 * 8–16 characters (the input is a numeric keypad) and not a repeated or
 * sequential run. Returns the i18n key of the violated rule, or null when valid.
 *
 * Never apply this to the password typed at an unlock gate: a gate only checks
 * the input against the keystore.
 */
export function validatePaymentPassword(password: string): PaymentPasswordRuleKey | null {
  if (password.length < PAYMENT_PASSWORD_MIN_LENGTH) return 'form.payPasswordMinLength';
  if (password.length > PAYMENT_PASSWORD_MAX_LENGTH) return 'form.payPasswordMaxLength';
  if (isTriviallyGuessable(password)) return 'form.payPasswordTooSimple';
  return null;
}
