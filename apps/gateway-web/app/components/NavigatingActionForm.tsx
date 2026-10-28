'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { Stack } from './layout/Layout';
import { useHydrated } from '../../lib/use-hydrated';

/** Await the saved result before loading a fresh server-rendered page. */
export function NavigatingActionForm({ action, children, className, autoFocusName }: {
  action: (data: FormData) => Promise<string>;
  children: ReactNode;
  className?: string;
  autoFocusName?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const ready = useHydrated();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ready || !autoFocusName) return;
    const field = form.current?.elements.namedItem(autoFocusName);
    if (field instanceof HTMLElement) field.focus();
  }, [ready, autoFocusName]);
  return <Stack as="form" elementRef={form} method="post" className={className} aria-busy={!ready || pending} onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    try { window.location.assign(await action(data)); }
    catch { setPending(false); setFailed(true); }
  }}>
    {/* Prevent a native POST before the client action is ready, while retaining Stack's child layout rules. */}
    <Stack as="fieldset" disabled={!ready || pending} style={{ display: 'contents' }}>{children}</Stack>
    {failed ? <p role="alert"><T value={ui.errors.actionFailed} /></p> : null}
  </Stack>;
}
