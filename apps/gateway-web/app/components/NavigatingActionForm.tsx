'use client';

import { useState, type ReactNode } from 'react';
import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { Stack } from './layout/Layout';

/** Await the saved result before loading a fresh server-rendered page. */
export function NavigatingActionForm({ action, children, className }: {
  action: (data: FormData) => Promise<string>;
  children: ReactNode;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return <Stack as="form" method="post" className={className} aria-busy={pending} onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    try { window.location.assign(await action(data)); }
    catch { setPending(false); setFailed(true); }
  }}>{children}{failed ? <p role="alert"><T value={ui.errors.actionFailed} /></p> : null}</Stack>;
}
