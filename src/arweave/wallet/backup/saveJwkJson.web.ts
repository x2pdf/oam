export type SaveJwkStatus = 'saved' | 'cancelled';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function saveTauriText(content: string, filename: string): Promise<SaveJwkStatus> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!path) return 'cancelled';
  await writeFile(path, new TextEncoder().encode(content));
  return 'saved';
}

export async function saveJwkJson(jwkJson: string, filename: string): Promise<SaveJwkStatus> {
  if (!isTauri()) {
    throw new Error('JWK file export is only supported in the desktop app');
  }
  return saveTauriText(jwkJson, filename);
}
