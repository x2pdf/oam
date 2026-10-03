import { Platform, type KeyboardTypeOptions } from 'react-native';

export const PAYMENT_PASSWORD_MIN_LENGTH = 8;
export const PAYMENT_PASSWORD_MAX_LENGTH = 16;

/**
 * Opens on digits but lets the user switch to letters. iOS has a pad for exactly
 * that; Android's numeric pads cannot switch and reject letters, so it falls
 * back to the default keyboard.
 */
export const PAYMENT_PASSWORD_KEYBOARD_TYPE: KeyboardTypeOptions =
  Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';

type PaymentPasswordLengthRuleKey = 'form.payPasswordMinLength' | 'form.payPasswordMaxLength';
type PaymentPasswordRuleKey = PaymentPasswordLengthRuleKey | 'form.payPasswordTooSimple';

/** "11111111", "12345678", "87654321" and the like: one repeated char or a pure run. */
function isTriviallyGuessable(password: string): boolean {
  const codes = Array.from(password, (ch) => ch.charCodeAt(0));
  const step = codes[1] - codes[0];
  if (step !== 0 && Math.abs(step) !== 1) return false;
  return codes.every((code, i) => i === 0 || code - codes[i - 1] === step);
}

/**
 * Length rule only (8–16 characters), for the password typed at an unlock gate.
 * Rejecting a wrong length before the keystore check costs no lockout attempt.
 * Returns the i18n key of the violated rule, or null when valid.
 */
export function validatePaymentPasswordLength(password: string): PaymentPasswordLengthRuleKey | null {
  if (password.length < PAYMENT_PASSWORD_MIN_LENGTH) return 'form.payPasswordMinLength';
  if (password.length > PAYMENT_PASSWORD_MAX_LENGTH) return 'form.payPasswordMaxLength';
  return null;
}

/**
 * Payment password rules for creating or changing the password:
 * 8–16 characters (digits by default, letters allowed) and not a repeated or
 * sequential run. Returns the i18n key of the violated rule, or null when valid.
 *
 * Unlock gates use validatePaymentPasswordLength instead: the "too simple" rule
 * only governs choosing a new password.
 */
export function validatePaymentPassword(password: string): PaymentPasswordRuleKey | null {
  const lengthRuleKey = validatePaymentPasswordLength(password);
  if (lengthRuleKey) return lengthRuleKey;
  if (isTriviallyGuessable(password)) return 'form.payPasswordTooSimple';
  return null;
}
