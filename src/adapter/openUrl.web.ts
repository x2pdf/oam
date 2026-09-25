import { Linking } from 'react-native';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function openUrl(href: string): Promise<void> {
  if (isTauri()) {
    const { openUrl: openWithOpener } = await import('@tauri-apps/plugin-opener');
    await openWithOpener(href);
    return;
  }
  await Linking.openURL(href);
}
