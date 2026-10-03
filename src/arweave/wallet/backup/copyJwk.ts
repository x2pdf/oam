import * as Clipboard from 'expo-clipboard';

/** The JWK is a plaintext private key; do not leave it on the clipboard. */
const CLIPBOARD_CLEAR_MS = 60_000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;

export async function copyJwk(jwkJson: string): Promise<void> {
  if (!jwkJson) return;
  await Clipboard.setStringAsync(jwkJson);

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    void (async () => {
      try {
        // Leave the clipboard alone if the user has copied something else since.
        if ((await Clipboard.getStringAsync()) !== jwkJson) return;
      } catch {
        // Reading can be denied (e.g. webview permissions): clear anyway.
      }
      await Clipboard.setStringAsync('').catch(() => {});
    })();
  }, CLIPBOARD_CLEAR_MS);
}
