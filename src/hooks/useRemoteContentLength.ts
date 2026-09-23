import { useEffect, useState } from 'react';
import { probeRemoteContentLength } from '../utils/probeRemoteContentLength';

export function useRemoteContentLength(href: string | undefined) {
  const [bytes, setBytes] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!href) {
      setBytes(undefined);
      return;
    }

    let cancelled = false;
    setBytes(undefined);

    void probeRemoteContentLength(href).then((len) => {
      if (!cancelled) setBytes(len);
    });

    return () => {
      cancelled = true;
    };
  }, [href]);

  return bytes;
}
