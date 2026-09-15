let verifiedOldPassword: string | null = null;
let pendingNewPassword: string | null = null;

/** Old payment password verified at the replacement gate. */
export function setVerifiedOldPassword(password: string): void {
  verifiedOldPassword = password;
}

export function getVerifiedOldPassword(): string | null {
  return verifiedOldPassword;
}

/** New payment password collected before finalize (AR replacement). */
export function setPendingNewPassword(password: string): void {
  pendingNewPassword = password;
}

export function getPendingNewPassword(): string | null {
  return pendingNewPassword;
}

export function clearPaymentPasswordContext(): void {
  verifiedOldPassword = null;
  pendingNewPassword = null;
}

/** @deprecated Use setVerifiedOldPassword */
export function setVerifiedEthPassword(password: string): void {
  setVerifiedOldPassword(password);
}

/** @deprecated Use getVerifiedOldPassword */
export function getVerifiedEthPassword(): string | null {
  return getVerifiedOldPassword();
}

/** @deprecated Use clearPaymentPasswordContext */
export function clearVerifiedEthPassword(): void {
  clearPaymentPasswordContext();
}
