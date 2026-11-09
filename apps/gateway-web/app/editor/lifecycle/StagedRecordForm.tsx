'use client';
import { useRef, useState, type ReactNode, type FormEvent, type Ref } from 'react';
import { useHydrated } from '../../../lib/use-hydrated';
import { Stack } from '../../components/layout/Layout';
import { useTranslation } from '../../components/TranslationProvider';

/** Keep the entire composer mounted after an owner or pin failure; reuse the creation receipt. */
export function StagedRecordForm({ action, children, className, elementRef, beforeSubmit }: { action: (data: FormData) => Promise<string>; children: ReactNode; className?: string; elementRef?: Ref<HTMLFormElement>; beforeSubmit?: (form: HTMLFormElement) => boolean }) {
  const ready = useHydrated();
  const t = useTranslation(), operation = useRef(''), busy = useRef(false);
  const [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ready || busy.current) return;
    if (beforeSubmit && !beforeSubmit(event.currentTarget)) return;
    if (!operation.current) operation.current = crypto.randomUUID();
    const data = new FormData(event.currentTarget); data.set('operationId', operation.current); data.set('stagedForm', '1');
    busy.current = true; setPending(true); setFailed(false);
    try {
      const destination = await action(data);
      if (new URL(destination, window.location.origin).searchParams.has('error')) { setFailed(true); return; }
      window.location.assign(destination);
    } catch { setFailed(true); }
    finally { busy.current = false; setPending(false); }
  }
  return <Stack as="form" elementRef={elementRef} className={className} onSubmit={submit}>
    <fieldset disabled={!ready || pending} style={{ display: 'contents' }}>{children}</fieldset>
    {failed ? <p role="alert">{t({ en: 'Saving could not be completed. Your entries are preserved. Retry to finish attaching evidence to the same event.', de: 'Speichern konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten. Erneut versuchen, um die Belege mit demselben Ereignis zu verknüpfen.' })}</p> : null}
  </Stack>;
}
