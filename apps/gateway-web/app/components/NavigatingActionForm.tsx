'use client';

import { useState, type ReactNode } from 'react';

/** Await the saved result before loading a fresh server-rendered page. */
export function NavigatingActionForm({ action, children }: {
  action: (data: FormData) => Promise<string>;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  return <form aria-busy={pending} onSubmit={async (event) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    try { window.location.assign(await action(data)); }
    finally { setPending(false); }
  }}>{children}</form>;
}
