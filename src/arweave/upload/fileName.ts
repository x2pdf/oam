const GENERIC_PREFIX = 'file';
const NAME_LENGTH = 16;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function randomLetters(length: number): string {
  const values = new Uint8Array(length);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(values);
  } else {
    for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i++) out += LETTERS[values[i] % LETTERS.length];
  return out;
}

function safeExtension(originalName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(originalName.split('?')[0]);
  return match ? `.${match[1].toLowerCase()}` : '';
}

/** `file-` + 16 random lowercase letters, keeping only the original extension. */
export function generateGenericFileName(originalName: string): string {
  return `${GENERIC_PREFIX}-${randomLetters(NAME_LENGTH)}${safeExtension(originalName)}`;
}
