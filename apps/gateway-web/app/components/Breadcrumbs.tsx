'use client';

import { useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import type { ReactNode } from 'react';

type Crumb = { href?: string; label: ReactNode };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslation();
  return (
    <nav className="crumbs" aria-label={t(ui.common.breadcrumb)}>
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? <span className="crumbs-sep">·</span> : null}
          {item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
