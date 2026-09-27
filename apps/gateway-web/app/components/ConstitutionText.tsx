import type { ReactNode } from 'react';
import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline, OrderedEntry, OrderedNode } from '../../lib/api';
import { linkifyReferences, type CrossRefContext } from '../../lib/crossrefs';
import { articleHeading, concatenatedText, groupNodes, kindByCode, nodeHeading } from '../../lib/outline';
import { orderedText } from '../../lib/ordered-content';
import { NodeTitleForm } from './NodeTitleForm';

export type ConstitutionCrossRefs = Omit<CrossRefContext, 'kindLabel'>;

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
    kindByCode(outline, outline?.kinds[0]?.kindCode ?? 'article')?.displayLabel ?? 'Article';
  function withRefs(value: string): ReactNode {
    if (!crossRefs) {
      return value;
    }
    return linkifyReferences(value, { ...crossRefs, kindLabel });
  }
  const rootKind = kindByCode(outline, article && 'kind' in article ? article.kind ?? 'article' : outline?.kinds[0]?.kindCode ?? 'article');
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
        <OrderedContentTree entries={entries ?? article?.content ?? []} outline={outline} withRefs={withRefs} canEditTitles={canEditTitles} returnTo={returnTo} />
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
            {withRefs(concatenatedText(group.nodes))}
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
  const kind = kindByCode(outline, node.kind);
  const heading = nodeHeading(kind, node);
  const label = node.label ?? node.number ?? kind?.displayLabel ?? node.kind;
  return (
    <section className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{heading}</p> : null}
      {canEditTitles && returnTo ? (
        <NodeTitleForm nodeId={node.id} title={node.title} label={label} returnTo={returnTo} />
      ) : null}
      {kind?.showLabel && kind.labelPlacement === 'inline' ? <span className="num">{node.label ?? node.number}</span> : null}
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
export function OrderedContentTree({ entries, outline, withRefs = (text) => text, renderText, renderHeading, renderLabel, idPrefix = '', canEditTitles = false, returnTo }: {
  entries: OrderedEntry[]; outline?: ContentOutline; withRefs?: (text: string) => ReactNode;
  renderText?: (entry: OrderedEntry) => ReactNode;
  renderHeading?: (node: OrderedNode, heading: string) => ReactNode;
  renderLabel?: (node: OrderedNode, label: string) => ReactNode;
  idPrefix?: string;
  canEditTitles?: boolean;
  returnTo?: string;
}) {
  const groups: Array<{ entries: OrderedEntry[]; concatenated: boolean }> = [];
  for (const entry of entries) {
    const concatenated = !(canEditTitles && returnTo && kindByCode(outline, entry.node?.kind ?? '')?.titlePolicy !== 'none') && entry.type === 'child' && Boolean(entry.node) &&
      kindByCode(outline, entry.node!.kind)?.presentation === 'concatenated' &&
      (!kindByCode(outline, entry.node!.kind)?.showLabel || ['inline', 'superscript'].includes(kindByCode(outline, entry.node!.kind)?.labelPlacement ?? '')) && !kindByCode(outline, entry.node!.kind)?.showTitle && !kindByCode(outline, entry.node!.kind)?.showKind &&
      entry.node!.content.every((part) => part.type === 'text');
    const last = groups[groups.length - 1];
    if ((concatenated && last?.concatenated) || (entry.type === 'text' && last?.entries.every((part) => part.type === 'text'))) last!.entries.push(entry);
    else groups.push({ entries: [entry], concatenated });
  }
  return <div className="node-tree">{groups.map((group, index) => {
    if (group.concatenated) return <p key={index} className="constitution-body constitution-concat">{group.entries.map((part, partIndex) => {
      const unit = part.node!;
      const kind = kindByCode(outline, unit.kind);
      const text = orderedText(unit.content);
      const previous = partIndex > 0 ? orderedText(group.entries[partIndex - 1]!.node!.content) : '';
      const space = previous && text && !/\s$/u.test(previous) && !/^\s/u.test(text) ? ' ' : '';
      return <span key={unit.occurrenceId} id={`${idPrefix}${unit.occurrenceId}`}>{space}{kind?.showLabel && kind.labelPlacement === 'superscript' ? <sup className="num">{renderLabel ? renderLabel(unit, unit.label ?? '') : unit.label}</sup> : kind?.showLabel && kind.labelPlacement === 'inline' ? <span className="num">{renderLabel ? renderLabel(unit, unit.label ?? '') : unit.label}</span> : null}{unit.content.map((entry, textIndex) => <span key={entry.occurrenceId ?? textIndex} id={entry.occurrenceId ? `${idPrefix}${entry.occurrenceId}` : undefined}>{renderText ? renderText(entry) : withRefs(entry.text ?? '')}</span>)}</span>;
    })}</p>;
    const entry = group.entries[0]!;
    if (entry.type === 'text') return <p key={entry.occurrenceId ?? entry.logicalId ?? index} className="constitution-body">{group.entries.map((part, partIndex) => <span key={part.occurrenceId ?? part.logicalId ?? partIndex} id={part.occurrenceId ? `${idPrefix}${part.occurrenceId}` : undefined}>{renderText ? renderText(part) : withRefs(part.text ?? '')}</span>)}</p>;
    const node = entry.node;
    if (!node) return null;
    const kind = kindByCode(outline, node.kind);
    const heading = nodeHeading(kind, { kind: node.kind, label: node.label, number: null, title: node.title });
    const superscriptLabel = kind?.showLabel && kind.labelPlacement === 'superscript' ? node.label : null;
    const inlineLabel = kind?.showLabel && kind.labelPlacement === 'inline' ? node.label : null;
    return <section key={node.occurrenceId} id={`${idPrefix}${node.occurrenceId}`} className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{renderHeading ? renderHeading(node, heading) : heading}</p> : null}
      {canEditTitles && returnTo && kind?.titlePolicy !== 'none' ? <NodeTitleForm nodeId={node.occurrenceId} title={node.title} label={node.label ?? kind?.displayLabel ?? node.kind} returnTo={returnTo} /> : null}
      {superscriptLabel ? <sup className="num">{renderLabel ? renderLabel(node, superscriptLabel) : superscriptLabel}</sup> : null}
      {inlineLabel ? <span className="num">{renderLabel ? renderLabel(node, inlineLabel) : inlineLabel}</span> : null}
      <OrderedContentTree entries={node.content} outline={outline} withRefs={withRefs} renderText={renderText} renderHeading={renderHeading} renderLabel={renderLabel} idPrefix={idPrefix} canEditTitles={canEditTitles} returnTo={returnTo} />
    </section>;
  })}</div>;
}
