'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { useDraftState } from '../EditorDraftState';
import { useTranslation } from '../../components/TranslationProvider';
import { useHydrated } from '../../../lib/use-hydrated';
import { Stack } from '../../components/layout/Layout';

/** Wiki commands have their own draft, revision guard, error recovery and publication. */
export function WikiDraftForm({ children, embedded, action, className }: {
  children: ReactNode; embedded: boolean; action: (data: FormData) => Promise<string>; className?: string;
}) {
  const { dirty } = useDraftState(), t = useTranslation(), ready = useHydrated();
  const [changed, setChanged] = useState(false), [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const navigating = useRef(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (changed && !navigating.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [changed]);
  return <Stack as="form" method="post" className={className} aria-busy={!ready || pending} onChange={() => setChanged(true)} onSubmit={async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending || embedded && dirty) return;
    const data = new FormData(event.currentTarget); setPending(true); setFailed(false);
    try {
      const destination = await action(data), query = new URL(destination, window.location.origin).searchParams;
      if (query.has('error') || query.get('wikiStatus') === 'error') { setFailed(true); setPending(false); return; }
      navigating.current = true; window.location.assign(destination);
    } catch { setPending(false); setFailed(true); }
  }}>
    {embedded && dirty ? <p role="status">{t({ en: 'Save your text and publication details before saving the Wiki draft.', de: 'Speichern Sie Text und Veröffentlichungsangaben, bevor Sie den Wiki-Entwurf speichern.' })}</p> : null}
    <Stack as="fieldset" disabled={!ready || pending} style={{ display: 'contents' }}>{children}</Stack>
    {failed ? <p role="alert">{t({ en: 'The Wiki could not be saved. Your entries are still here. Reload to check for a newer revision before trying again.', de: 'Das Wiki konnte nicht gespeichert werden. Ihre Eingaben bleiben erhalten. Prüfen Sie vor einem neuen Versuch durch Neuladen, ob eine neuere Revision vorliegt.' })}</p> : null}
  </Stack>;
}
