let verifiedPassword: string | null = null;

export function setVerifiedEthPassword(password: string): void {
  verifiedPassword = password;
}

export function getVerifiedEthPassword(): string | null {
  return verifiedPassword;
}

export function clearVerifiedEthPassword(): void {
  verifiedPassword = null;
}
