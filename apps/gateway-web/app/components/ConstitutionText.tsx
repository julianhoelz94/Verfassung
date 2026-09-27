import type { ReactNode } from 'react';
import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline, OrderedEntry } from '../../lib/api';
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
    <div className="constitution-text text-column" lang={lang}>
      {showHeading && article && rootHeading ? (
        <Heading id={`${headingIdPrefix}-${article.articleNumber}`}>
          {rootHeading}
        </Heading>
      ) : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'inline' ? <span className="num">{article.articleNumber}</span> : null}
      {entries !== undefined || article?.content != null ? (
        <OrderedContentTree entries={entries ?? article?.content ?? []} outline={outline} withRefs={withRefs} />
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
export function OrderedContentTree({ entries, outline, withRefs = (text) => text }: { entries: OrderedEntry[]; outline?: ContentOutline; withRefs?: (text: string) => ReactNode }) {
  const groups: Array<{ entries: OrderedEntry[]; concatenated: boolean }> = [];
  for (const entry of entries) {
    const concatenated = entry.type === 'child' && Boolean(entry.node) &&
      kindByCode(outline, entry.node!.kind)?.presentation === 'concatenated' &&
      entry.node!.content.every((part) => part.type === 'text');
    const last = groups[groups.length - 1];
    if (concatenated && last?.concatenated) last.entries.push(entry);
    else groups.push({ entries: [entry], concatenated });
  }
  return <div className="node-tree">{groups.map((group, index) => {
    if (group.concatenated) return <p key={index} className="constitution-body constitution-concat">{withRefs(orderedText(group.entries))}</p>;
    const entry = group.entries[0]!;
    if (entry.type === 'text') return <p key={entry.occurrenceId ?? entry.logicalId ?? index} id={entry.occurrenceId ?? undefined} className="constitution-body">{withRefs(entry.text ?? '')}</p>;
    const node = entry.node;
    if (!node) return null;
    const kind = kindByCode(outline, node.kind);
    const heading = nodeHeading(kind, { kind: node.kind, label: node.label, number: null, title: node.title });
    const inlineLabel = kind?.showLabel && kind.labelPlacement === 'inline' ? node.label : null;
    return <section key={node.occurrenceId} id={node.occurrenceId} className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{heading}</p> : null}
      {inlineLabel ? <span className="num">{inlineLabel}</span> : null}
      <OrderedContentTree entries={node.content} outline={outline} withRefs={withRefs} />
    </section>;
  })}</div>;
}
