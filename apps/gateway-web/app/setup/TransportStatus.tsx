'use client';

import { fetchWithTimeout } from '../../lib/fetch-with-timeout';

import { useEffect, useState } from 'react';
import { T } from '../components/TranslationProvider';
import { setupMessages as m } from '../../lib/setup-messages';

export function TransportStatus() {
  const [status, setStatus] = useState<{ ready: boolean; message: string; expiresAt?: string; lastCertificateError?: string } | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const update = () => fetchWithTimeout('/setup/transport/status', { cache: 'no-store', signal: controller.signal }).then(response => response.ok ? response.json() : null).then(value => { if (active) setStatus(value); }).catch(() => { if (active) setStatus(null); });
    void update();
    const timer = setInterval(update, 5000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);
  return <><p role="status">{status ? <>{status.message}{status.expiresAt ? <> · {status.expiresAt}</> : null}</> : <a href="/setup/transport/status"><T value={m.status} /></a>}</p>{status?.lastCertificateError ? <p role="alert" className="alert alert-error">{status.lastCertificateError}</p> : null}</>;
}
