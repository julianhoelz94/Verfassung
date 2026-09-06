import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline } from '../../lib/api';
import { articleHeading, concatenatedText, groupNodes, kindByCode, nodeHeading } from '../../lib/outline';
import { NodeTitleForm } from './NodeTitleForm';

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
}: ConstitutionTextProps) {
  const Heading = headingLevel;
  const children = nodes ?? (article && 'children' in article ? article.children : undefined);
  const text = body !== undefined ? body : (article?.body ?? null);
  return (
    <div className="constitution-text">
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
        <NodeTree nodes={children} outline={outline} canEditTitles={canEditTitles} returnTo={returnTo} />
      ) : text ? (
        <p className="constitution-body">{text}</p>
      ) : null}
    </div>
  );
}

type NodeTreeProps = {
  nodes: ContentNode[];
  outline?: ContentOutline;
  canEditTitles?: boolean;
  returnTo?: string;
};

export function NodeTree({ nodes, outline, canEditTitles = false, returnTo }: NodeTreeProps) {
  return (
    <div className="node-tree">
      {groupNodes(nodes, outline).map((group, index) =>
        group.type === 'concatenated' ? (
          <p key={group.nodes.map((node) => node.id).join('-') || index} className="constitution-body constitution-concat">
            {concatenatedText(group.nodes)}
          </p>
        ) : (
          <SectionNode
            key={group.node.id}
            node={group.node}
            outline={outline}
            canEditTitles={canEditTitles}
            returnTo={returnTo}
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
}: {
  node: ContentNode;
  outline?: ContentOutline;
  canEditTitles?: boolean;
  returnTo?: string;
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
      {node.body ? <p className="constitution-body">{node.body}</p> : null}
      {node.children.length > 0 ? (
        <NodeTree nodes={node.children} outline={outline} canEditTitles={canEditTitles} returnTo={returnTo} />
      ) : null}
    </section>
  );
}
