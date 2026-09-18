import { useEffect, useState } from 'react';
import { DATA_SOURCE_REQUEST_TIMEOUT_MS } from '../constants';
import type { IDataSource } from '../datasource/types';

export type DataSourceProbeStatus =
  | { kind: 'unconfigured' }
  | { kind: 'checking' }
  | { kind: 'ok'; latencyMs: number }
  | { kind: 'timeout' };

export type DataSourceProbeMap = Record<string, DataSourceProbeStatus>;

function isSourceActive(source: IDataSource): boolean {
  return !(source.requiresApiKey && !source.apiKey);
}

class ProbeTimeoutError extends Error {
  constructor() {
    super('PROBE_TIMEOUT');
    this.name = 'ProbeTimeoutError';
  }
}

/**
 * Measures round-trip time for fetchLatestBlockNumber, bounded by timeoutMs and abort signal.
 */
export async function measureSourceLatency(
  source: IDataSource,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<number> {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const start = Date.now();

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = () => {
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };

    signal.addEventListener('abort', onAbort);

    const timer = setTimeout(() => {
      finish(() => reject(new ProbeTimeoutError()));
    }, timeoutMs);

    source
      .fetchLatestBlockNumber()
      .then(() => finish(() => resolve(Date.now() - start)))
      .catch((err) => finish(() => reject(err)));
  });
}

function buildInitialProbeMap(sources: IDataSource[]): DataSourceProbeMap {
  return sources.reduce<DataSourceProbeMap>((acc, source) => {
    acc[source.name] = isSourceActive(source)
      ? { kind: 'checking' }
      : { kind: 'unconfigured' };
    return acc;
  }, {});
}

/**
 * While visible, probes each active data source in parallel; retries on failure until success or dismiss.
 */
export function useDataSourceConnectivityProbe(
  visible: boolean,
  sources: IDataSource[],
  apiKeyRevision: string,
): DataSourceProbeMap {
  const [probeBySource, setProbeBySource] = useState<DataSourceProbeMap>({});

  useEffect(() => {
    if (!visible) {
      setProbeBySource({});
      return;
    }

    const modalAbort = new AbortController();
    setProbeBySource(buildInitialProbeMap(sources));

    const setStatus = (name: string, status: DataSourceProbeStatus) => {
      if (modalAbort.signal.aborted) return;
      setProbeBySource((prev) => ({ ...prev, [name]: status }));
    };

    const runSourceProbeLoop = async (source: IDataSource) => {
      if (!isSourceActive(source)) return;

      while (!modalAbort.signal.aborted) {
        setStatus(source.name, { kind: 'checking' });

        const attemptAbort = new AbortController();
        const onModalAbort = () => attemptAbort.abort();
        modalAbort.signal.addEventListener('abort', onModalAbort);

        try {
          const latencyMs = await measureSourceLatency(
            source,
            DATA_SOURCE_REQUEST_TIMEOUT_MS,
            attemptAbort.signal,
          );
          if (modalAbort.signal.aborted) return;
          setStatus(source.name, { kind: 'ok', latencyMs });
          return;
        } catch {
          if (modalAbort.signal.aborted) return;
          setStatus(source.name, { kind: 'timeout' });
        } finally {
          modalAbort.signal.removeEventListener('abort', onModalAbort);
        }
      }
    };

    for (const source of sources) {
      void runSourceProbeLoop(source);
    }

    return () => {
      modalAbort.abort();
    };
  }, [visible, sources, apiKeyRevision]);

  return probeBySource;
}
