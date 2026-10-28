'use client';

import type { ReactNode } from 'react';
import type { ContentOutline, OrderedEntry } from '../../lib/api';
import { nodes, type DraftDifference, type DraftNode } from '../../lib/structured-editor';
import { useTranslation } from '../components/TranslationProvider';
import { InlineText } from '../components/InlineText';
import styles from './ChangeOverview.module.css';

export type OverviewDifference = DraftDifference & { rootId?: string; sourceLink?: string; targetLink?: string; beforeText?: string; afterText?: string };
export function ChangeOverview({ differences, roots, sourceRoots, outline, onNavigate }: {
  differences: OverviewDifference[]; roots: DraftNode[]; sourceRoots: DraftNode[]; outline: ContentOutline; onNavigate: (index: number) => void;
}) {
  const t = useTranslation(), all = nodes([...sourceRoots, ...roots]);
  const copy = (en: string, de: string) => t({ en, de });
  const fieldLabels: Record<string, string> = {
    text: copy('Wording', 'Wortlaut'), title: copy('Title', 'Titel'), label: copy('Label', 'Bezeichnung'),
    rich: copy('Formatting and references', 'Formatierung und Verweise'), parent: copy('Parent unit', 'Übergeordnete Einheit'),
    position: copy('Position', 'Position'), inserted: copy('Added', 'Hinzugefügt'), removed: copy('Removed', 'Entfernt'),
  };
  const markLabels = { bold: copy('Bold', 'Fett'), italic: copy('Italic', 'Kursiv'), underline: copy('Underline', 'Unterstrichen'), strikethrough: copy('Strikethrough', 'Durchgestrichen') };
  function unitLabel(node?: DraftNode) {
    return node ? [outline.kinds.find(kind => kind.kindCode === node.kind)?.displayLabel ?? node.kind, node.label, node.title].filter(Boolean).join(' ') : copy('Passage', 'Textstelle');
  }
  function owner(difference: OverviewDifference) {
    return [...roots, ...sourceRoots].find(root => root.logicalId === difference.rootId) ??
      [...roots, ...sourceRoots].find(root => nodes([root]).some(node => node.logicalId === difference.logicalId || node.content.some(entry => entry.logicalId === difference.logicalId)));
  }
  function entry(roots: DraftNode[], id: string) { return nodes(roots).flatMap(node => node.content).find(entry => entry.logicalId === id); }
  function rich(value: string): OrderedEntry | null {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : null; } catch { return null; }
  }
  function richPreview(value: string, text: string | undefined, comparedValue: string): ReactNode {
    const content = rich(value); if (!content) return copy('Text properties changed', 'Texteigenschaften geändert');
    const descriptions: string[] = [];
    const breaks = content.lineBreaksBefore ?? 0;
    if (breaks || breaks !== (rich(comparedValue)?.lineBreaksBefore ?? 0)) descriptions.push(breaks
      ? breaks + ' ' + copy(breaks === 1 ? 'line break before' : 'line breaks before', breaks === 1 ? 'Zeilenumbruch davor' : 'Zeilenumbrüche davor')
      : copy('Normal sentence spacing', 'Normaler Satzabstand'));
    if (content.format === 'footnote') descriptions.push(copy('Footnote', 'Fußnote') + ' ' + (content.footnoteLabel ?? '*'));
    if (content.table) descriptions.push([content.table.caption, content.table.rows.map(row => row.cells.map(cell => cell.text).join(' | ')).join('\n')].filter(Boolean).join('\n'));
    for (const mark of content.marks ?? []) descriptions.push(markLabels[mark.type] + ' ' + copy('characters', 'Zeichen') + ' ' + (mark.start + 1) + '–' + mark.end);
    for (const reference of content.references ?? []) descriptions.push(reference.target.type === 'external' ? reference.target.url ?? copy('External reference', 'Externer Verweis') : reference.target.type === 'footnote' ? copy('Footnote reference', 'Fußnotenverweis') : unitLabel(all.find(node => node.logicalId === reference.target.logicalId)));
    if (content.annotation) descriptions.push(copy('Annotation', 'Anmerkung') + (content.annotation.attribution ? ': ' + content.annotation.attribution : ''));
    return <>{text ? <p className={styles.excerpt}><InlineText text={text} marks={content.marks} /></p> : null}<span className={styles.description}>{descriptions.length ? descriptions.join(' · ') : copy('Plain text', 'Unformatierter Text')}</span></>;
  }
  function preview(difference: OverviewDifference, side: 'before' | 'after'): ReactNode {
    const value = difference[side], context = side === 'before' ? sourceRoots : roots;
    const text = (side === 'before' ? difference.beforeText : difference.afterText) ?? entry(context, difference.logicalId)?.text ?? undefined;
    if (difference.field === 'rich') return richPreview(value, text, difference[side === 'before' ? 'after' : 'before']);
    if (difference.field === 'parent') return value ? unitLabel(all.find(node => node.logicalId === value)) : copy('Top level', 'Oberste Ebene');
    if (difference.field === 'position') return copy('Position', 'Position') + ' ' + (Number(value) + 1);
    const rendered = ['inserted', 'removed'].includes(difference.field) ? text ?? (value ? unitLabel(all.find(node => node.logicalId === difference.logicalId)) : '') : value;
    return rendered ? <p className={styles.excerpt}>{rendered}</p> : <span className={styles.description}>—</span>;
  }
  const groups = new Map<string, { label: string; rows: { difference: OverviewDifference; index: number }[] }>();
  differences.forEach((difference, index) => {
    const root = owner(difference), key = root?.logicalId ?? difference.rootId ?? '';
    const group = groups.get(key) ?? { label: unitLabel(root), rows: [] }; group.rows.push({ difference, index }); groups.set(key, group);
  });
  return <div>{[...groups.entries()].map(([key, group]) => <section key={key} className={styles.group}><h3>{group.label}</h3><ol>{group.rows.map(({ difference, index }) => {
    const unit = all.find(node => node.logicalId === difference.logicalId || node.content.some(entry => entry.logicalId === difference.logicalId));
    return <li key={difference.logicalId + ':' + difference.field} className={styles.row}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate(index)}>{unit ? unitLabel(unit) + ' · ' : ''}{fieldLabels[difference.field] ?? copy('Change', 'Änderung')}</button>
      <div className={styles.versions}><div><span className={styles.description}>{copy('Before', 'Vorher')}</span>{preview(difference, 'before')}</div><div><span className={styles.description}>{copy('After', 'Nachher')}</span>{preview(difference, 'after')}</div></div>
      <details><summary>{copy('Revision details', 'Revisionsdetails')}</summary><p>{difference.logicalId}<br />{difference.sourceRevisionId ?? '—'} → {difference.targetRevisionId ?? '—'}</p>{difference.sourceLink ? <a href={difference.sourceLink}>{copy('Source snapshot', 'Quelltextstand')}</a> : null}{' '}{difference.targetLink ? <a href={difference.targetLink}>{copy('Published successor', 'Veröffentlichter Nachfolger')}</a> : null}</details>
    </li>;
  })}</ol></section>)}</div>;
}
