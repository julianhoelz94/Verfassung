'use client';

import { useCallback, useEffect, useState } from 'react';
import { T } from '../components/TranslationProvider';
import { migrationUi } from '../../lib/migration-messages';

export function LegacyResolver({ initialUrl, canonicalOrigin }: { initialUrl: string; canonicalOrigin: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<'idle' | 'loading' | 'unresolved'>('idle');
  const resolve = useCallback(async (source: string) => {
    setState('loading');
    try {
      const response = await fetch(`/api/catalog/legacy-resolve?${new URLSearchParams({ url: source })}`);
      if (!response.ok) throw new Error('Unresolved');
      const result = await response.json() as { targetUrl: string };
      if (!result.targetUrl.startsWith('/') || result.targetUrl.startsWith('//')) throw new Error('Invalid target');
      window.location.replace(new URL(result.targetUrl, canonicalOrigin).href);
    } catch { setState('unresolved'); }
  }, [canonicalOrigin]);
  useEffect(() => {
    const source = initialUrl || (window.location.host !== new URL(canonicalOrigin).host ? window.location.href : '');
    // Synchronize the browser-only fragment and loading state with the legacy resolution request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (source) { setUrl(source); void resolve(source); }
    // The source fragment is read in the browser because HTTP requests do not contain it.
  }, [initialUrl, canonicalOrigin, resolve]);
  return <form onSubmit={event => { event.preventDefault(); void resolve(url); }}>
    <label htmlFor="legacy-source"><T value={migrationUi.legacyUrl} /></label>
    <input id="legacy-source" type="url" required value={url} onChange={event => setUrl(event.target.value)} />
    <button type="submit" disabled={state === 'loading'}><T value={migrationUi.resolveLegacy} /></button>
    {state === 'loading' ? <p role="status"><T value={migrationUi.resolving} /></p> : null}
    {state === 'unresolved' ? <p role="alert"><T value={migrationUi.unresolvedLink} /></p> : null}
  </form>;
}
