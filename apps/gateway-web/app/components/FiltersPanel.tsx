'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function FiltersPanel({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  if (desktop) {
    return <aside className="search-sidebar" aria-label="Filters">{children}</aside>;
  }

  return (
    <details className="filters-disclosure">
      <summary className="btn btn-sm">Filters</summary>
      {children}
    </details>
  );
}
