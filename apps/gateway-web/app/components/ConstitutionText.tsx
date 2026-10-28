import { Fragment, type HTMLAttributes, type ReactElement, type ReactNode, type RefAttributes } from 'react';
import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline, OrderedEntry, OrderedInlineReference, OrderedNode, OrderedTableCell } from '../../lib/api';
import { linkifyReferences, type CrossRefContext } from '../../lib/crossrefs';
import { articleHeading, effectiveDisplayKind, groupNodes, kindByCode, nodeHeading } from '../../lib/outline';
import { orderedText } from '../../lib/ordered-content';
import { NodeTitleForm } from './NodeTitleForm';
import { LocalizedTitle, LocalizedTableRegion, LocalizedFootnoteBacklink } from './LocalizedRegion';
import { ui } from '../../lib/messages';
import { migrationUi } from '../../lib/migration-messages';
import { T } from './TranslationProvider';
import { FootnoteMarker, FootnoteProvider } from './Footnotes';
import { footnoteItems, type FootnoteItem } from '../../lib/footnotes';
import { InlineText } from './InlineText';
import documentStyles from './ConstitutionDocument.module.css';

export type ConstitutionCrossRefs = Omit<CrossRefContext, 'kindLabel'> & { unitsByLogicalId?: Record<string, { rootId: string; occurrenceId: string }>; footnotes?: FootnoteItem[] };

type ConstitutionTextProps = {
  article?:
    | Pick<ArticleDetail, 'articleNumber' | 'title' | 'body' | 'children' | 'kind' | 'content'>
    | Pick<ArticleSummary, 'articleNumber' | 'title' | 'body' | 'children' | 'content'>;
  nodes?: ContentNode[];
  entries?: OrderedEntry[];
  body?: string | null;
  headingLevel?: 'h1' | 'h2' | 'h3';
  showHeading?: boolean;
  rootAnchor?: boolean;
  outline?: ContentOutline;
  canEditTitles?: boolean;
  returnTo?: string;
  headingIdPrefix?: string;
  lang?: string;
  crossRefs?: ConstitutionCrossRefs;
  hideFootnotes?: boolean;
};

/** Keep configured heading order while giving an article's descriptive title less emphasis. */
export function ConstitutionArticleHeading({ article, outline }: {
  article: Pick<ArticleSummary, 'articleNumber' | 'title' | 'kind'>;
  outline?: ContentOutline;
}) {
  const heading = articleHeading(outline, article), suffix = ` — ${article.title}`;
  return article.title && heading.endsWith(suffix)
    ? <>{heading.slice(0, -suffix.length)}<span className={documentStyles.headingSeparator}> — </span><span className={documentStyles.articleTitle}>{article.title}</span></>
    : <>{heading}</>;
}

export function ConstitutionText({
  article,
  nodes,
  entries,
  body,
  headingLevel = 'h1',
  showHeading = true,
  rootAnchor = true,
  outline,
  canEditTitles = false,
  returnTo,
  headingIdPrefix = 'article',
  lang,
  crossRefs,
  hideFootnotes = false,
}: ConstitutionTextProps) {
  const Heading = headingLevel;
  const children = nodes ?? (article && 'children' in article ? article.children : undefined);
  const text = body !== undefined ? body : (article?.body ?? null);
  const kindLabel =
    kindByCode(outline, 'article')?.displayLabel ?? 'Article';
  function withRefs(value: string): ReactNode {
    if (!crossRefs) {
      return value;
    }
    return linkifyReferences(value, { ...crossRefs, kindLabel });
  }
  const rootKind = effectiveDisplayKind(kindByCode(outline, article && 'kind' in article ? article.kind ?? 'article' : outline?.kinds[0]?.kindCode ?? 'article'));
  const rootHeading = article ? articleHeading(outline, { ...article, kind: article && 'kind' in article ? article.kind : undefined }) : '';
  return (
    <div className={`constitution-text text-column ${documentStyles.text}${showHeading && article ? ' ' + documentStyles.article : ''}`} lang={lang} id={rootAnchor && article && 'id' in article && typeof article.id === 'string' ? article.id : undefined}>
      {showHeading && article && rootHeading ? (
        <Heading id={`${headingIdPrefix}-${article.articleNumber}`}>
          <ConstitutionArticleHeading article={{ ...article, kind: 'kind' in article ? article.kind : undefined }} outline={outline} />
        </Heading>
      ) : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'inline' ? <span className="num">{article.articleNumber}</span> : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'superscript' ? <sup className="num">{article.articleNumber}</sup> : null}
      {entries !== undefined || article?.content != null ? (
        <OrderedContentTree entries={entries ?? article?.content ?? []} outline={outline} withRefs={withRefs} canEditTitles={canEditTitles} returnTo={returnTo} crossRefs={crossRefs} hideFootnotes={hideFootnotes} />
      ) : children && children.length > 0 ? (
        <NodeTree
          nodes={children}
          outline={outline}
          canEditTitles={canEditTitles}
          returnTo={returnTo}
          withRefs={withRefs}
        />
      ) : text ? (
        <p className="constitution-body">{withRefs(text)}</p>
      ) : null}
    </div>
  );
}

type NodeTreeProps = {
  nodes: ContentNode[];
  outline?: ContentOutline;
  canEditTitles?: boolean;
  returnTo?: string;
  withRefs?: (text: string) => ReactNode;
};

export function NodeTree({
  nodes,
  outline,
  canEditTitles = false,
  returnTo,
  withRefs = (text) => text,
}: NodeTreeProps) {
  return (
    <div className="node-tree">
      {groupNodes(nodes, outline).map((group, index) =>
        group.type === 'concatenated' ? (
          <p key={group.nodes.map((node) => node.id).join('-') || index} className="constitution-body constitution-concat">
            {group.nodes.map((node, nodeIndex) => {
              const kind = effectiveDisplayKind(kindByCode(outline, node.kind));
              const label = node.label ?? node.number;
              return <span key={node.id}>{nodeIndex > 0 ? ' ' : null}
                {kind?.showLabel && label && kind.labelPlacement === 'superscript' ? <sup className="num">{label}</sup> : null}
                {kind?.showLabel && label && kind.labelPlacement === 'inline' ? <span className="num">{label}</span> : null}
                {withRefs(node.body?.trim() ?? '')}
              </span>;
            })}
          </p>
        ) : (
          <SectionNode
            key={group.node.id}
            node={group.node}
            outline={outline}
            canEditTitles={canEditTitles}
            returnTo={returnTo}
            withRefs={withRefs}
          />
        ),
      )}
    </div>
  );
}

function SectionNode({
  node,
  outline,
  canEditTitles = false,
  returnTo,
  withRefs = (text) => text,
}: {
  node: ContentNode;
  outline?: ContentOutline;
  canEditTitles?: boolean;
  returnTo?: string;
  withRefs?: (text: string) => ReactNode;
}) {
  const kind = effectiveDisplayKind(kindByCode(outline, node.kind));
  const heading = nodeHeading(kind, node);
  const label = node.label ?? node.number ?? kind?.displayLabel ?? node.kind;
  return (
    <section className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{heading}</p> : null}
      {canEditTitles && returnTo ? (
        <NodeTitleForm nodeId={node.id} title={node.title} label={label} returnTo={returnTo} />
      ) : null}
      {kind?.showLabel && kind.labelPlacement === 'inline' ? <span className="num">{node.label ?? node.number}</span> : null}
      {kind?.showLabel && kind.labelPlacement === 'superscript' ? <sup className="num">{node.label ?? node.number}</sup> : null}
      {node.body ? (
        <div className="para">
          <p className="constitution-body">{withRefs(node.body)}</p>
        </div>
      ) : null}
      {node.children.length > 0 ? (
        <NodeTree
          nodes={node.children}
          outline={outline}
          canEditTitles={canEditTitles}
          returnTo={returnTo}
          withRefs={withRefs}
        />
      ) : null}
    </section>
  );
}

export type OrderedNodeElement = ReactElement<HTMLAttributes<HTMLElement> & RefAttributes<HTMLElement>>;

/** Layout separators are outside the authored text and its UTF-16 ranges. */
function AuthoredBreaks({ count, structuralBreak = false }: { count?: number; structuralBreak?: boolean }) {
  const length = Math.max(0, (count ?? 0) - (structuralBreak ? 1 : 0));
  return <>{Array.from({ length }, (_, index) => <br key={index} data-authored-break="true" />)}</>;
}

/** Both the reader and editorial preview use the same document-end note list. */
export function ConstitutionFootnotes({ entries, outline, idPrefix = '', backlinkIdPrefix, indexedBacklinks, renderFootnote, footnoteActions, children }: {
  entries: OrderedEntry[];
  outline?: ContentOutline;
  idPrefix?: string;
  backlinkIdPrefix?: string;
  indexedBacklinks?: Map<string, string[]>;
  renderFootnote?: (entry: OrderedEntry, element: ReactElement) => ReactNode;
  footnoteActions?: (entry: OrderedEntry) => ReactNode;
  children?: ReactNode;
}) {
  return <section className={documentStyles.notes}>
    <h2><T value={{ en: 'Footnotes', de: 'Fußnoten' }} /></h2>
    <OrderedContentTree entries={entries} outline={outline} idPrefix={idPrefix} backlinkIdPrefix={backlinkIdPrefix} indexedBacklinks={indexedBacklinks} renderFootnote={renderFootnote} footnoteActions={footnoteActions} />
    {children}
  </section>;
}

/** Ordered reader rendering shares heading and sibling presentation rules with NodeTree. */
export function OrderedContentTree({ entries, outline, withRefs = (text) => text, renderText, renderTextSlice, renderTableCell, renderTableCaption, renderReference, renderHeading, renderLabel, renderNode, renderFootnote, footnoteActions, idPrefix = '', backlinkIdPrefix, canEditTitles = false, returnTo, indexedTargets, indexedNotes, indexedBacklinks, crossRefs, hideFootnotes = false, suppressLeadingBreaks = false }: {
  entries: OrderedEntry[]; outline?: ContentOutline; withRefs?: (text: string) => ReactNode;
  renderText?: (entry: OrderedEntry) => ReactNode;
  renderTextSlice?: (entry: OrderedEntry, start: number, end: number) => ReactNode;
  renderTableCell?: (cell: OrderedTableCell, entry: OrderedEntry) => ReactNode;
  renderTableCaption?: (entry: OrderedEntry) => ReactNode;
  renderReference?: (reference: OrderedInlineReference, label: string, href: string | undefined, entry: OrderedEntry) => ReactNode;
  renderHeading?: (node: OrderedNode, heading: string) => ReactNode;
  renderLabel?: (node: OrderedNode, label: string) => ReactNode;
  renderNode?: (node: OrderedNode, element: OrderedNodeElement) => ReactNode;
  renderFootnote?: (entry: OrderedEntry, element: ReactElement) => ReactNode;
  footnoteActions?: (entry: OrderedEntry) => ReactNode;
  idPrefix?: string;
  backlinkIdPrefix?: string;
  canEditTitles?: boolean;
  returnTo?: string;
  indexedTargets?: Map<string, { rootId: string; occurrenceId: string }>;
  indexedNotes?: Map<string, string>;
  indexedBacklinks?: Map<string, string[]>;
  crossRefs?: ConstitutionCrossRefs;
  hideFootnotes?: boolean;
  suppressLeadingBreaks?: boolean;
}) {
  const targets = indexedTargets ?? new Map<string, { rootId: string; occurrenceId: string }>();
  const notes = indexedNotes ?? new Map<string, string>();
  const backlinks = indexedBacklinks ?? new Map<string, string[]>();
  function index(items: OrderedEntry[], rootId?: string) {
    for (const item of items) {
      if (item.node) {
        const root = rootId ?? item.node.occurrenceId;
        targets.set(item.node.logicalId, { rootId: root, occurrenceId: item.node.occurrenceId });
        index(item.node.content, root);
      } else {
        if (item.logicalId && item.occurrenceId) targets.set(item.logicalId, { rootId: rootId ?? item.occurrenceId, occurrenceId: item.occurrenceId });
        if (item.format === 'footnote' && item.logicalId && item.occurrenceId) notes.set(item.logicalId, item.occurrenceId);
        for (const ref of item.references ?? []) if (ref.target.type === 'footnote' && ref.target.footnoteId) backlinks.set(ref.target.footnoteId, [...(backlinks.get(ref.target.footnoteId) ?? []), ref.logicalId]);
      }
    }
  }
  if (!indexedTargets) index(entries);
  function richText(entry: OrderedEntry): ReactNode {
    const value = entry.text ?? '';
    if (!entry.references?.length && renderTextSlice) return renderTextSlice(entry, 0, value.length);
    if (!entry.references?.length) return <InlineText text={value} marks={entry.marks} render={withRefs} />;
    const result: ReactNode[] = [];
    let previous = 0;
    for (const ref of [...entry.references].sort((a, b) => a.start - b.start || a.end - b.end)) {
      if (ref.start > previous) result.push(renderTextSlice ? <Fragment key={'text-' + previous}>{renderTextSlice(entry, previous, ref.start)}</Fragment> : <InlineText key={'text-' + previous} text={value} marks={entry.marks} start={previous} end={ref.start} render={withRefs} />);
      const target = ref.target;
      const unit = target.logicalId ? crossRefs?.unitsByLogicalId?.[target.logicalId] ?? targets.get(target.logicalId) : undefined;
      const href = target.type === 'external' ? target.url ?? undefined : target.type === 'footnote' && target.footnoteId && notes.get(target.footnoteId) ? `#${idPrefix}fn-${notes.get(target.footnoteId)}` : unit && crossRefs ? crossRefs.code ? `/countries/${crossRefs.code}/versions/${crossRefs.versionId}/units/${unit.rootId}#${unit.occurrenceId}` : `/versions/${crossRefs.versionId}/units/${unit.rootId}?occurrenceId=${unit.occurrenceId}` : unit ? `#${idPrefix}${unit.occurrenceId}` : undefined;
      const label = value.slice(ref.start, ref.end);
      const formatted = <InlineText text={value} marks={entry.marks} start={ref.start} end={ref.end} />;
      result.push(renderReference ? <span key={ref.logicalId} id={idPrefix + 'ref-' + ref.logicalId}>{renderReference(ref, label, href, entry)}</span> : target.type === 'footnote' && target.footnoteId ? <FootnoteMarker key={ref.logicalId} noteId={target.footnoteId} referenceId={idPrefix + 'ref-' + ref.logicalId}>{label ? formatted : undefined}</FootnoteMarker> : href ? <a key={ref.logicalId} id={idPrefix + 'ref-' + ref.logicalId} className="xref" href={href}>{formatted}</a> : <LocalizedTitle key={ref.logicalId} className="xref-unavailable" label={ui.accessibilityDynamic.referenceUnavailable}>{formatted}</LocalizedTitle>);
      previous = ref.end;
    }
    if (previous < value.length) result.push(renderTextSlice ? <Fragment key={'text-' + previous}>{renderTextSlice(entry, previous, value.length)}</Fragment> : <InlineText key={'text-' + previous} text={value} marks={entry.marks} start={previous} render={withRefs} />);
    return result;
  }
  const groups: Array<{ entries: OrderedEntry[]; concatenated: boolean }> = [];
  for (const entry of entries) {
    if (hideFootnotes && entry.format === 'footnote') continue;
    const kind = effectiveDisplayKind(kindByCode(outline, entry.node?.kind ?? ''));
    const concatenated = !(canEditTitles && returnTo && kindByCode(outline, entry.node?.kind ?? '')?.titlePolicy !== 'none') && entry.type === 'child' && Boolean(entry.node) &&
      kind?.presentation === 'concatenated' &&
      (!kind.showLabel || ['inline', 'superscript'].includes(kind.labelPlacement ?? '')) && !kind.showTitle && !kind.showKind &&
      entry.node!.content.every((part) => part.type === 'text' && (!part.format || part.format === 'plain'));
    const last = groups[groups.length - 1];
    if ((concatenated && last?.concatenated) || (entry.type === 'text' && (!entry.format || entry.format === 'plain') && last?.entries.every((part) => part.type === 'text' && (!part.format || part.format === 'plain')))) last!.entries.push(entry);
    else groups.push({ entries: [entry], concatenated });
  }
  const tree = <div className="node-tree">{groups.map((group, index) => {
    if (group.concatenated) return <p key={index} className="constitution-body constitution-concat">{group.entries.map((part, partIndex) => {
      const unit = part.node!;
      const kind = effectiveDisplayKind(kindByCode(outline, unit.kind));
      const text = orderedText(unit.content);
      const previous = partIndex > 0 ? orderedText(group.entries[partIndex - 1]!.node!.content) : '';
      const breaks = unit.content[0]?.lineBreaksBefore ?? 0;
      const space = !breaks && previous && text && !/\s$/u.test(previous) && !/^\s/u.test(text) ? ' ' : '';
      const element = <span key={unit.occurrenceId} id={`${idPrefix}${unit.occurrenceId}`}><AuthoredBreaks count={breaks} structuralBreak={suppressLeadingBreaks && index === 0 && partIndex === 0} />{space}{kind?.showLabel && kind.labelPlacement === 'superscript' ? <sup className="num">{renderLabel ? renderLabel(unit, unit.label ?? '') : unit.label}</sup> : kind?.showLabel && kind.labelPlacement === 'inline' ? <span className="num">{renderLabel ? renderLabel(unit, unit.label ?? '') : unit.label}</span> : null}{unit.content.map((entry, textIndex) => <span key={entry.occurrenceId ?? textIndex} id={entry.occurrenceId ? `${idPrefix}${entry.occurrenceId}` : undefined}>{textIndex > 0 ? <AuthoredBreaks count={entry.lineBreaksBefore} /> : null}{renderText && !entry.references?.length ? renderText(entry) : richText(entry)}</span>)}</span>;
      return renderNode ? <Fragment key={unit.occurrenceId}>{renderNode(unit, element)}</Fragment> : element;
    })}</p>;
    const entry = group.entries[0]!;
    if (entry.type === 'text' && entry.format === 'table' && entry.table) return <LocalizedTableRegion key={entry.occurrenceId ?? entry.logicalId ?? index} id={entry.occurrenceId ? `${idPrefix}${entry.occurrenceId}` : undefined} caption={entry.table.caption}><table className="legal-table">{entry.table.caption ? <caption>{renderTableCaption ? renderTableCaption(entry) : entry.table.caption}</caption> : null}<tbody>{entry.table.rows.map(row => <tr key={row.logicalId}>{row.cells.map(cell => cell.header ? <th key={cell.logicalId} id={`${idPrefix}cell-${cell.logicalId}`} scope="col" rowSpan={cell.rowSpan ?? 1} colSpan={cell.colSpan ?? 1}>{renderTableCell ? renderTableCell(cell, entry) : cell.text}</th> : <td key={cell.logicalId} id={`${idPrefix}cell-${cell.logicalId}`} headers={cell.headers?.map(id => `${idPrefix}cell-${id}`).join(' ') || undefined} rowSpan={cell.rowSpan ?? 1} colSpan={cell.colSpan ?? 1}>{renderTableCell ? renderTableCell(cell, entry) : cell.text}</td>)}</tr>)}</tbody></table></LocalizedTableRegion>;
    if (entry.type === 'text' && entry.format === 'footnote') {
      const element = <aside id={entry.occurrenceId ? `${idPrefix}fn-${entry.occurrenceId}` : undefined} className={`legal-footnote ${documentStyles.note}`} role="note"><span className={documentStyles.noteLabel}>{entry.footnoteLabel ?? '*'}</span><div className={documentStyles.noteBody}>{entry.annotation ? <p className={documentStyles.annotation}><strong><T value={entry.annotation.kind === 'editorial' ? migrationUi.editorial : entry.annotation.kind === 'amendment' ? migrationUi.amendment : migrationUi.sourceAnnotation} /></strong>{entry.annotation.attribution ? <> · {entry.annotation.attribution}</> : null}{entry.annotation.sourceUrl?.startsWith('https://') ? <> · <a href={entry.annotation.sourceUrl}><T value={migrationUi.source} /></a></> : null}</p> : null}<span id={entry.occurrenceId ? idPrefix + entry.occurrenceId : undefined}>{renderText ? renderText(entry) : richText(entry)}</span> {(entry.logicalId ? backlinks.get(entry.logicalId) : undefined)?.map((id, linkIndex) => <LocalizedFootnoteBacklink key={id} href={`#${backlinkIdPrefix ?? idPrefix}ref-${id}`} index={linkIndex + 1} />)}</div>{footnoteActions ? <span className={documentStyles.noteActions}>{footnoteActions(entry)}</span> : null}</aside>;
      return <Fragment key={entry.occurrenceId ?? entry.logicalId ?? index}>{renderFootnote ? renderFootnote(entry, element) : element}</Fragment>;
    }
    if (entry.type === 'text') return <p key={entry.occurrenceId ?? entry.logicalId ?? index} className="constitution-body">{group.entries.map((part, partIndex) => <span key={part.occurrenceId ?? part.logicalId ?? partIndex} id={part.occurrenceId ? `${idPrefix}${part.occurrenceId}` : undefined}><AuthoredBreaks count={part.lineBreaksBefore} structuralBreak={suppressLeadingBreaks && index === 0 && partIndex === 0} />{renderText && !part.references?.length ? renderText(part) : richText(part)}</span>)}</p>;
    const node = entry.node;
    if (!node) return null;
    const kind = effectiveDisplayKind(kindByCode(outline, node.kind));
    const heading = nodeHeading(kind, { kind: node.kind, label: node.label, number: null, title: node.title });
    const superscriptLabel = kind?.showLabel && kind.labelPlacement === 'superscript' ? node.label : null;
    const inlineLabel = kind?.showLabel && kind.labelPlacement === 'inline' ? node.label : null;
    const element = <section key={node.occurrenceId} id={`${idPrefix}${node.occurrenceId}`} className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{renderHeading ? renderHeading(node, heading) : heading}</p> : null}
      {canEditTitles && returnTo && kind?.titlePolicy !== 'none' ? <NodeTitleForm nodeId={node.occurrenceId} title={node.title} label={node.label ?? kind?.displayLabel ?? node.kind} returnTo={returnTo} /> : null}
      {superscriptLabel ? <sup className="num">{renderLabel ? renderLabel(node, superscriptLabel) : superscriptLabel}</sup> : null}
      {inlineLabel ? <span className="num">{renderLabel ? renderLabel(node, inlineLabel) : inlineLabel}</span> : null}
      <OrderedContentTree entries={node.content} outline={outline} withRefs={withRefs} renderText={renderText} renderTextSlice={renderTextSlice} renderTableCell={renderTableCell} renderTableCaption={renderTableCaption} renderReference={renderReference} renderHeading={renderHeading} renderLabel={renderLabel} renderNode={renderNode} renderFootnote={renderFootnote} footnoteActions={footnoteActions} idPrefix={idPrefix} backlinkIdPrefix={backlinkIdPrefix} canEditTitles={canEditTitles} returnTo={returnTo} indexedTargets={targets} indexedNotes={notes} indexedBacklinks={backlinks} crossRefs={crossRefs} hideFootnotes={hideFootnotes} suppressLeadingBreaks={!node.content.some(part => part.node)} />
    </section>;
    return renderNode ? <Fragment key={node.occurrenceId}>{renderNode(node, element)}</Fragment> : element;
  })}</div>;
  return indexedTargets ? tree : <FootnoteProvider notes={crossRefs?.footnotes ?? footnoteItems(entries, '', idPrefix)}>{tree}</FootnoteProvider>;
}
