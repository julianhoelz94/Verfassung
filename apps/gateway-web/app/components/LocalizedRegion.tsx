'use client';

import type { ReactNode } from 'react';
import type { UiMessage } from '../../lib/messages';
import { useTranslation } from './TranslationProvider';

export function LocalizedRegion({ as, label, className, children }: { as: 'nav' | 'div'; label: UiMessage; className?: string; children: ReactNode }) {
  const t = useTranslation();
  return as === 'nav'
    ? <nav className={className} aria-label={t(label)}>{children}</nav>
    : <div className={className} aria-label={t(label)}>{children}</div>;
}

export function LocalizedTitle({ label, className, children }: { label: UiMessage; className?: string; children: ReactNode }) {
  const t = useTranslation();
  return <span className={className} title={t(label)}>{children}</span>;
}
