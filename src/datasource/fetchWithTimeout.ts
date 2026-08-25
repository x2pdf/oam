import { DATA_SOURCE_REQUEST_TIMEOUT_MS } from '../constants';

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

/**
 * fetch with AbortController timeout so hung explorer APIs cannot pin connections forever.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DATA_SOURCE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      ...DEFAULT_HEADERS,
      ...(init.headers as Record<string, string> | undefined),
    };
    return await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}