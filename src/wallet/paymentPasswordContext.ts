/**
 * In-memory hand-off of the payment password between the screens of a wallet
 * replacement flow (gate → disclaimer → input → setup → finalize).
 *
 * The values are plaintext passwords, so they expire quickly and are dropped when
 * the flow ends or is abandoned (see clearPaymentPasswordContext callers: finalize,
 * the flow's entry screens, and the app going to the background).
 */
const CONTEXT_TTL_MS = 10 * 60_000;

let verifiedOldPassword: string | null = null;
let pendingNewPassword: string | null = null;
let expiresAt = 0;

function touch(): void {
  expiresAt = Date.now() + CONTEXT_TTL_MS;
}

function expireIfStale(): void {
  if (expiresAt !== 0 && Date.now() > expiresAt) {
    clearPaymentPasswordContext();
  }
}

/** Old payment password verified at the replacement gate. */
export function setVerifiedOldPassword(password: string): void {
  verifiedOldPassword = password;
  touch();
}

export function getVerifiedOldPassword(): string | null {
  expireIfStale();
  return verifiedOldPassword;
}

/** New payment password collected before finalize (AR replacement). */
export function setPendingNewPassword(password: string): void {
  pendingNewPassword = password;
  touch();
}

export function getPendingNewPassword(): string | null {
  expireIfStale();
  return pendingNewPassword;
}

export function clearPaymentPasswordContext(): void {
  verifiedOldPassword = null;
  pendingNewPassword = null;
  expiresAt = 0;
}
