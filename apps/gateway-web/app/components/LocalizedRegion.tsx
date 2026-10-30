'use client';

import type { ReactNode } from 'react';
import { ui, type UiMessage } from '../../lib/messages';
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

export function LocalizedTableRegion({ caption, id, children }: { caption?: string | null; id?: string; children: ReactNode }) {
  const t = useTranslation();
  return <div className="legal-table-scroll" id={id} role="region" aria-label={caption || t(ui.remainingStatus.legalTable)} tabIndex={0}>{children}</div>;
}
