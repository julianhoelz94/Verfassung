'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReaderChange, ReaderPublication } from '../../lib/reader';
import { readerUi as copy } from '../../lib/reader-messages';
import { useLocale, useTranslation } from './TranslationProvider';
import { formatDate } from '../../lib/format-date';
import { ReaderIcon } from './ReaderIcon';
import styles from './VersionReader.module.css';

export function ReaderComparison({ constitutionId, publications, viewedVersionId, readerHref, comparisonHref, active = true }: {
  constitutionId: string; publications: ReaderPublication[]; viewedVersionId: string;
  readerHref: (versionId: string) => string; comparisonHref?: string; active?: boolean;
}) {
  const t = useTranslation(), locale = useLocale();
  const current = Math.max(0, publications.findIndex(version => version.snapshotId === viewedVersionId));
  const [from, setFrom] = useState(publications[Math.max(0, current - 1)]?.snapshotId ?? '');
  const [to, setTo] = useState(publications[current === 0 && publications.length > 1 ? 1 : current]?.snapshotId ?? '');
  const [result, setResult] = useState<{ key: string; changes: ReaderChange[] } | null>(null);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0), [selected, setSelected] = useState(0);
  const cache = useRef(new Map<string, ReaderChange[]>()), key = from + ':' + to;
  useEffect(() => {
    if (!active || !from || !to || from === to) return;
    const controller = new AbortController();
    async function load() {
      const cached = cache.current.get(key);
      if (cached) return { from, to, changes: cached };
      const response = await fetch('/api/reader/compare?' + new URLSearchParams({ constitutionId, from, to }), { signal: controller.signal });
      if (!response.ok) throw new Error('comparison');
      return response.json() as Promise<{ from: string; to: string; changes: ReaderChange[] }>;
    }
    load().then(data => {
        if (controller.signal.aborted) return;
        if (data.from !== from || data.to !== to || !Array.isArray(data.changes)) throw new Error('comparison');
        if (cache.current.size >= 12) cache.current.clear();
        cache.current.set(key, data.changes); setResult({ key, changes: data.changes }); setFailed(false);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [constitutionId, from, to, key, retry, active]);
  if (publications.length < 2) return <p className={styles.empty}>{t(copy.needPublications)}</p>;
  const changes = result?.key === key ? result.changes : null, change = changes?.[selected];
  const targetVersion = change?.toRoot ? to : from, targetRoot = change?.toRoot ?? change?.fromRoot;
  const targetHref = targetRoot ? (targetVersion === viewedVersionId ? '' : readerHref(targetVersion)) + '#unit-' + targetRoot : undefined;
  const distinctLegalPublications = publications.find(item => item.snapshotId === from)?.id !== publications.find(item => item.snapshotId === to)?.id;
  const fullHref = comparisonHref && distinctLegalPublications ? comparisonHref + '?' + new URLSearchParams({ from, to }) : undefined;
  const options = publications.map(item => <option key={item.snapshotId} value={item.snapshotId}>{item.versionLabel}{item.effectiveDate ? ' · ' + formatDate(item.effectiveDate, locale) : ''}</option>);
  return <div className={styles.comparison}>
    <h2 className={styles.eyebrow}>{t(copy.compareVersions)}</h2>
    <div className={styles.publications}>
      <label>{t(copy.from)}<select aria-label={t(copy.from)} value={from} onChange={event => { setFrom(event.target.value); setFailed(false); setSelected(0); }}>{options}</select></label>
      <button className={styles.tool} type="button" aria-label={t(copy.swap)} onClick={() => { setFrom(to); setTo(from); setFailed(false); setSelected(0); }}><ReaderIcon name="swap" /></button>
      <label>{t(copy.to)}<select aria-label={t(copy.to)} value={to} onChange={event => { setTo(event.target.value); setFailed(false); setSelected(0); }}>{options}</select></label>
    </div>
    <div aria-live="polite" aria-busy={from !== to && !changes && !failed}>
      {from === to ? <><h3>{t(copy.noDifferences)}</h3><p>{t(copy.samePublication)}</p></> : failed ? <p role="alert">{t(copy.compareUnavailable)} <button type="button" className={styles.tool} onClick={() => { setFailed(false); setRetry(value => value + 1); }}>{t(copy.retry)}</button></p> : !changes ? <p>{t(copy.loadingComparison)}</p> : !change ? <h3>{t(copy.noDifferences)}</h3> : <>
        <div className={styles.changeHeading}><h3>{change.label}</h3><span>{selected + 1} {t(copy.of)} {changes.length} · {t(copy[change.kind === 'added' ? 'addition' : change.kind === 'removed' ? 'removal' : 'change'])}</span>
          <button type="button" className={styles.tool} disabled={!selected} aria-label={t(copy.previousChange)} onClick={() => setSelected(value => value - 1)}><ReaderIcon name="up" /></button>
          <button type="button" className={styles.tool} disabled={selected >= changes.length - 1} aria-label={t(copy.nextChange)} onClick={() => setSelected(value => value + 1)}><ReaderIcon name="down" /></button>
        </div>
        {change.presentationOnly ? <p>{t(copy.structureChanged)}</p> : <p className={styles.diff}>{change.segments.map((segment, i) => segment.type === 'add' ? <ins key={i}>{segment.text}</ins> : segment.type === 'remove' ? <del key={i}>{segment.text}</del> : <span key={i}>{segment.text}</span>)}</p>}
        {targetHref ? <a className={styles.textAction} href={targetHref}><ReaderIcon name="arrow" />{t(copy.changedPassage)}</a> : null}
      </>}
    </div>
    {fullHref ? <a className={styles.fullComparison} href={fullHref}>{t(copy.fullComparison)}</a> : null}
  </div>;
}
