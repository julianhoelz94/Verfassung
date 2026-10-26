'use client';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useEffect, useState, type ReactNode } from 'react';

export function FiltersPanel({ children, count = 0 }: { children: ReactNode; count?: number }) {
  const t = useTranslation();
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  // A stable subtree preserves unsaved filter selections across responsive changes.
  return <details className={desktop ? 'search-sidebar' : 'filters-disclosure'} open={desktop || open}
    aria-label={t(ui.accessibility.filters)} onToggle={event => {
      if (!desktop) setOpen(event.currentTarget.open);
    }}>
    <summary className="btn btn-sm"><T value={ui.components.filterspanel.filters} />{count ? ` (${count})` : ''}</summary>
    <div className="filters-content">{children}</div>
  </details>;
}
