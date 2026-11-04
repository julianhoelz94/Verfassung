'use client';

import type { ReactNode } from 'react';
import { useTranslation } from '../components/TranslationProvider';
import { ConstitutionDocument } from '../components/ConstitutionDocument';
import { diffText, segsForSide } from '../../lib/text-diff';
import styles from './PassageComparison.module.css';

export type PassageSide = { text: string; label?: string; href?: string; identity?: string; source?: ReactNode; emptyMessage?: string };

/** One bounded comparison surface for recorded passages and detected differences. */
export function PassageComparison({ before, after }: { before: PassageSide; after: PassageSide }) {
  const t = useTranslation();
  const spans = before.text.length + after.text.length < 8000 ? diffText(before.text, after.text) : [
    { type: 'remove' as const, text: before.text }, { type: 'add' as const, text: after.text },
  ];
  return <div className={styles.sides}>{([['before', before], ['after', after]] as const).map(([side, value]) => <section key={side} className={styles.side} aria-label={t(side === 'before' ? { en: 'Before', de: 'Vorher' } : { en: 'After', de: 'Nachher' })}>
    <h4>{t(side === 'before' ? { en: 'Before', de: 'Vorher' } : { en: 'After', de: 'Nachher' })}</h4>
    {value.label ? <p className={styles.label}>{value.href ? <a href={value.href} target="_blank" rel="noreferrer">{value.label}</a> : value.label}</p> : null}
    <ConstitutionDocument className={styles.wording}>{value.text ? <p>{segsForSide(spans, side === 'before' ? 'from' : 'to').map((seg, index) => seg.type === 'remove' ? <del key={index}>{seg.text}</del> : seg.type === 'add' ? <ins key={index}>{seg.text}</ins> : <span key={index}>{seg.text}</span>)}</p> : <p className={styles.empty}>{value.emptyMessage ?? t({ en: 'No wording on this side.', de: 'Auf dieser Seite kein Wortlaut.' })}</p>}</ConstitutionDocument>
    {value.source ? <details><summary>{t({ en: 'Source formatting', de: 'Quellformatierung' })}</summary><ConstitutionDocument>{value.source}</ConstitutionDocument></details> : null}
    {value.identity ? <details><summary>{t({ en: 'Exact reference', de: 'Genauer Verweis' })}</summary><code className={styles.identity}>{value.identity}</code></details> : null}
  </section>)}</div>;
}
