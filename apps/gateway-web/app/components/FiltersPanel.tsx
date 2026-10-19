'use client';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useEffect, useState, type ReactNode } from 'react';

export function FiltersPanel({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  if (desktop) {
    return <aside className="search-sidebar" aria-label={t(ui.accessibility.filters)}>{children}</aside>;
  }

  return (
    <details className="filters-disclosure">
      <summary className="btn btn-sm"><T value={ui.components.filterspanel.filters} /></summary>
      {children}
    </details>
  );
}
