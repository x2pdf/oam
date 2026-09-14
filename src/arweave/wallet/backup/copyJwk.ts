import * as Clipboard from 'expo-clipboard';

export async function copyJwk(jwkJson: string): Promise<void> {
  if (!jwkJson) return;
  await Clipboard.setStringAsync(jwkJson);
}
