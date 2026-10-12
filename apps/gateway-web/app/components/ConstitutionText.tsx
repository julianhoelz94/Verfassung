import type { ReactNode } from 'react';
import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline, OrderedEntry, OrderedInlineReference, OrderedNode, OrderedTableCell } from '../../lib/api';
import { linkifyReferences, type CrossRefContext } from '../../lib/crossrefs';
import { articleHeading, effectiveDisplayKind, groupNodes, kindByCode, nodeHeading } from '../../lib/outline';
import { orderedText } from '../../lib/ordered-content';
import { NodeTitleForm } from './NodeTitleForm';

export type ConstitutionCrossRefs = Omit<CrossRefContext, 'kindLabel'> & { unitsByLogicalId?: Record<string, { rootId: string; occurrenceId: string }> };

type ConstitutionTextProps = {
  article?:
    | Pick<ArticleDetail, 'articleNumber' | 'title' | 'body' | 'children' | 'kind' | 'content'>
    | Pick<ArticleSummary, 'articleNumber' | 'title' | 'body' | 'children' | 'content'>;
  nodes?: ContentNode[];
  entries?: OrderedEntry[];
  body?: string | null;
  headingLevel?: 'h1' | 'h2' | 'h3';
  showHeading?: boolean;
  outline?: ContentOutline;
  canEditTitles?: boolean;
  returnTo?: string;
  headingIdPrefix?: string;
  lang?: string;
  crossRefs?: ConstitutionCrossRefs;
};

export function ConstitutionText({
  article,
  nodes,
  entries,
  body,
  headingLevel = 'h1',
  showHeading = true,
  outline,
  canEditTitles = false,
  returnTo,
  headingIdPrefix = 'article',
  lang,
  crossRefs,
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
    <div className="constitution-text text-column" lang={lang} id={article && 'id' in article && typeof article.id === 'string' ? article.id : undefined}>
      {showHeading && article && rootHeading ? (
        <Heading id={`${headingIdPrefix}-${article.articleNumber}`}>
          {rootHeading}
        </Heading>
      ) : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'inline' ? <span className="num">{article.articleNumber}</span> : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'superscript' ? <sup className="num">{article.articleNumber}</sup> : null}
      {entries !== undefined || article?.content != null ? (
        <OrderedContentTree entries={entries ?? article?.content ?? []} outline={outline} withRefs={withRefs} canEditTitles={canEditTitles} returnTo={returnTo} crossRefs={crossRefs} />
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

/** Ordered reader rendering shares heading and sibling presentation rules with NodeTree. */
export function OrderedContentTree({ entries, outline, withRefs = (text) => text, renderText, renderTableCell, renderTableCaption, renderReference, renderHeading, renderLabel, idPrefix = '', canEditTitles = false, returnTo, indexedTargets, indexedNotes, indexedBacklinks, crossRefs }: {
  entries: OrderedEntry[]; outline?: ContentOutline; withRefs?: (text: string) => ReactNode;
  renderText?: (entry: OrderedEntry) => ReactNode;
  renderTableCell?: (cell: OrderedTableCell, entry: OrderedEntry) => ReactNode;
  renderTableCaption?: (entry: OrderedEntry) => ReactNode;
  renderReference?: (reference: OrderedInlineReference, label: string, href: string | undefined, entry: OrderedEntry) => ReactNode;
  renderHeading?: (node: OrderedNode, heading: string) => ReactNode;
  renderLabel?: (node: OrderedNode, label: string) => ReactNode;
  idPrefix?: string;
  canEditTitles?: boolean;
  returnTo?: string;
  indexedTargets?: Map<string, { rootId: string; occurrenceId: string }>;
  indexedNotes?: Map<string, string>;
  indexedBacklinks?: Map<string, string[]>;
  crossRefs?: ConstitutionCrossRefs;
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
        if (item.format === 'footnote' && item.logicalId && item.occurrenceId) notes.set(item.logicalId, item.occurrenceId);
        for (const ref of item.references ?? []) if (ref.target.type === 'footnote' && ref.target.footnoteId) backlinks.set(ref.target.footnoteId, [...(backlinks.get(ref.target.footnoteId) ?? []), ref.logicalId]);
      }
    }
  }
  if (!indexedTargets) index(entries);
  function richText(entry: OrderedEntry): ReactNode {
    const value = entry.text ?? '';
    if (!entry.references?.length) return withRefs(value);
    const result: ReactNode[] = [];
    let previous = 0;
    for (const ref of [...entry.references].sort((a, b) => a.start - b.start)) {
      if (ref.start > previous) result.push(withRefs(value.slice(previous, ref.start)));
      const target = ref.target;
      const unit = target.logicalId ? targets.get(target.logicalId) ?? crossRefs?.unitsByLogicalId?.[target.logicalId] : undefined;
      const href = target.type === 'external' ? target.url ?? undefined : target.type === 'footnote' && target.footnoteId && notes.get(target.footnoteId) ? `#${idPrefix}fn-${notes.get(target.footnoteId)}` : unit && crossRefs ? `/countries/${crossRefs.code}/versions/${crossRefs.versionId}/units/${unit.rootId}#${unit.occurrenceId}` : unit ? `#${idPrefix}${unit.occurrenceId}` : undefined;
      const label = value.slice(ref.start, ref.end);
      result.push(renderReference ? <span key={ref.logicalId} id={`${idPrefix}ref-${ref.logicalId}`}>{renderReference(ref, label, href, entry)}</span> : href ? <a key={ref.logicalId} id={`${idPrefix}ref-${ref.logicalId}`} className="xref" href={href}>{label}</a> : <span key={ref.logicalId} className="xref-unavailable" title="Referenced provision is unavailable here">{label}</span>);
      previous = ref.end;
    }
    if (previous < value.length) result.push(withRefs(value.slice(previous)));
    return result;
  }
  const groups: Array<{ entries: OrderedEntry[]; concatenated: boolean }> = [];
  for (const entry of entries) {
    const kind = effectiveDisplayKind(kindByCode(outline, entry.node?.kind ?? ''));
    const concatenated = !(canEditTitles && returnTo && kindByCode(outline, entry.node?.kind ?? '')?.titlePolicy !== 'none') && entry.type === 'child' && Boolean(entry.node) &&
      kind?.presentation === 'concatenated' &&
      (!kind.showLabel || ['inline', 'superscript'].includes(kind.labelPlacement ?? '')) && !kind.showTitle && !kind.showKind &&
      entry.node!.content.every((part) => part.type === 'text' && (!part.format || part.format === 'plain'));
    const last = groups[groups.length - 1];
    if ((concatenated && last?.concatenated) || (entry.type === 'text' && (!entry.format || entry.format === 'plain') && last?.entries.every((part) => part.type === 'text' && (!part.format || part.format === 'plain')))) last!.entries.push(entry);
    else groups.push({ entries: [entry], concatenated });
  }
  return <div className="node-tree">{groups.map((group, index) => {
    if (group.concatenated) return <p key={index} className="constitution-body constitution-concat">{group.entries.map((part, partIndex) => {
      const unit = part.node!;
      const kind = effectiveDisplayKind(kindByCode(outline, unit.kind));
      const text = orderedText(unit.content);
      const previous = partIndex > 0 ? orderedText(group.entries[partIndex - 1]!.node!.content) : '';
      const space = previous && text && !/\s$/u.test(previous) && !/^\s/u.test(text) ? ' ' : '';
      return <span key={unit.occurrenceId} id={`${idPrefix}${unit.occurrenceId}`}>{space}{kind?.showLabel && kind.labelPlacement === 'superscript' ? <sup className="num">{renderLabel ? renderLabel(unit, unit.label ?? '') : unit.label}</sup> : kind?.showLabel && kind.labelPlacement === 'inline' ? <span className="num">{renderLabel ? renderLabel(unit, unit.label ?? '') : unit.label}</span> : null}{unit.content.map((entry, textIndex) => <span key={entry.occurrenceId ?? textIndex} id={entry.occurrenceId ? `${idPrefix}${entry.occurrenceId}` : undefined}>{renderText && !entry.references?.length ? renderText(entry) : richText(entry)}</span>)}</span>;
    })}</p>;
    const entry = group.entries[0]!;
    if (entry.type === 'text' && entry.format === 'table' && entry.table) return <div key={entry.occurrenceId ?? entry.logicalId ?? index} className="legal-table-scroll" id={entry.occurrenceId ? `${idPrefix}${entry.occurrenceId}` : undefined} role="region" aria-label={entry.table.caption ?? 'Legal table'} tabIndex={0}><table className="legal-table">{entry.table.caption ? <caption>{renderTableCaption ? renderTableCaption(entry) : entry.table.caption}</caption> : null}<tbody>{entry.table.rows.map(row => <tr key={row.logicalId}>{row.cells.map(cell => cell.header ? <th key={cell.logicalId} id={`${idPrefix}cell-${cell.logicalId}`} scope="col" rowSpan={cell.rowSpan ?? 1} colSpan={cell.colSpan ?? 1}>{renderTableCell ? renderTableCell(cell, entry) : cell.text}</th> : <td key={cell.logicalId} id={`${idPrefix}cell-${cell.logicalId}`} headers={cell.headers?.map(id => `${idPrefix}cell-${id}`).join(' ') || undefined} rowSpan={cell.rowSpan ?? 1} colSpan={cell.colSpan ?? 1}>{renderTableCell ? renderTableCell(cell, entry) : cell.text}</td>)}</tr>)}</tbody></table></div>;
    if (entry.type === 'text' && entry.format === 'footnote') return <aside key={entry.occurrenceId ?? entry.logicalId ?? index} id={entry.occurrenceId ? `${idPrefix}fn-${entry.occurrenceId}` : undefined} className="legal-footnote" role="note"><sup>{entry.footnoteLabel ?? '*'}</sup> {renderText ? renderText(entry) : entry.text} {(entry.logicalId ? backlinks.get(entry.logicalId) : undefined)?.map((id, linkIndex) => <a key={id} href={`#${idPrefix}ref-${id}`} aria-label={`Back to footnote reference ${linkIndex + 1}`}>↩</a>)}</aside>;
    if (entry.type === 'text') return <p key={entry.occurrenceId ?? entry.logicalId ?? index} className="constitution-body">{group.entries.map((part, partIndex) => <span key={part.occurrenceId ?? part.logicalId ?? partIndex} id={part.occurrenceId ? `${idPrefix}${part.occurrenceId}` : undefined}>{renderText && !part.references?.length ? renderText(part) : richText(part)}</span>)}</p>;
    const node = entry.node;
    if (!node) return null;
    const kind = effectiveDisplayKind(kindByCode(outline, node.kind));
    const heading = nodeHeading(kind, { kind: node.kind, label: node.label, number: null, title: node.title });
    const superscriptLabel = kind?.showLabel && kind.labelPlacement === 'superscript' ? node.label : null;
    const inlineLabel = kind?.showLabel && kind.labelPlacement === 'inline' ? node.label : null;
    return <section key={node.occurrenceId} id={`${idPrefix}${node.occurrenceId}`} className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{renderHeading ? renderHeading(node, heading) : heading}</p> : null}
      {canEditTitles && returnTo && kind?.titlePolicy !== 'none' ? <NodeTitleForm nodeId={node.occurrenceId} title={node.title} label={node.label ?? kind?.displayLabel ?? node.kind} returnTo={returnTo} /> : null}
      {superscriptLabel ? <sup className="num">{renderLabel ? renderLabel(node, superscriptLabel) : superscriptLabel}</sup> : null}
      {inlineLabel ? <span className="num">{renderLabel ? renderLabel(node, inlineLabel) : inlineLabel}</span> : null}
      <OrderedContentTree entries={node.content} outline={outline} withRefs={withRefs} renderText={renderText} renderTableCell={renderTableCell} renderTableCaption={renderTableCaption} renderReference={renderReference} renderHeading={renderHeading} renderLabel={renderLabel} idPrefix={idPrefix} canEditTitles={canEditTitles} returnTo={returnTo} indexedTargets={targets} indexedNotes={notes} indexedBacklinks={backlinks} crossRefs={crossRefs} />
    </section>;
  })}</div>;
}
