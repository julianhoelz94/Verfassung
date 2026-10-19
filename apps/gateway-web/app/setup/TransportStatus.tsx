'use client';
import { useEffect, useState } from 'react';
import { T } from '../components/TranslationProvider';
import { setupMessages as m } from '../../lib/setup-messages';

export function TransportStatus() {
  const [status, setStatus] = useState<{ ready: boolean; message: string; expiresAt?: string } | null>(null);
  useEffect(() => {
    let active = true;
    const update = () => fetch('/setup/transport/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(value => { if (active) setStatus(value); }).catch(() => { if (active) setStatus(null); });
    void update();
    const timer = setInterval(update, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <p role="status">{status ? <>{status.message}{status.expiresAt ? <> · {status.expiresAt}</> : null}</> : <a href="/setup/transport/status"><T value={m.status} /></a>}</p>;
}
