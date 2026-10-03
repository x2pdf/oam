export const PAYMENT_PASSWORD_MIN_LENGTH = 6;
export const PAYMENT_PASSWORD_MAX_LENGTH = 16;

/**
 * Payment password rules, identical to wallet creation:
 * 6–16 characters (the input is a numeric keypad). Returns the i18n key of the
 * violated rule, or null when valid.
 */
export function validatePaymentPassword(password: string): 'form.payPasswordMinLength' | 'form.payPasswordMaxLength' | null {
  if (password.length < PAYMENT_PASSWORD_MIN_LENGTH) return 'form.payPasswordMinLength';
  if (password.length > PAYMENT_PASSWORD_MAX_LENGTH) return 'form.payPasswordMaxLength';
  return null;
}
