import type { ReactNode } from 'react';
import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline } from '../../lib/api';
import { linkifyReferences, type CrossRefContext } from '../../lib/crossrefs';
import { articleHeading, concatenatedText, groupNodes, kindByCode, nodeHeading } from '../../lib/outline';
import { NodeTitleForm } from './NodeTitleForm';

export type ConstitutionCrossRefs = Omit<CrossRefContext, 'kindLabel'>;

type ConstitutionTextProps = {
  article?:
    | Pick<ArticleDetail, 'articleNumber' | 'title' | 'body' | 'children' | 'kind'>
    | Pick<ArticleSummary, 'articleNumber' | 'title' | 'body' | 'children'>;
  nodes?: ContentNode[];
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
  return (
    <div className="constitution-text text-column" lang={lang}>
      {showHeading && article ? (
        <Heading id={`${headingIdPrefix}-${article.articleNumber}`}>
          {articleHeading(outline, {
            articleNumber: article.articleNumber,
            title: article.title,
            kind: 'kind' in article ? article.kind : undefined,
          })}
        </Heading>
      ) : null}
      {children && children.length > 0 ? (
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
      {node.body ? (
        <div className="para">
          <span className="num">{node.label ?? node.number ?? ''}</span>
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
