import type { ArticleSummary, ContentNode, ContentOutline } from '../../lib/api';
import { articleHeading, asOutlinePresentation, concatenatedText, kindByCode, nodeHeading } from '../../lib/outline';
import { alignNodes, diffText, segsForSide, type DiffSeg } from '../../lib/text-diff';

type ArticleLike = Pick<ArticleSummary, 'articleNumber' | 'title' | 'body' | 'children'>;

type DiffConstitutionTextProps = {
  left?: ArticleLike;
  right?: ArticleLike;
  side: 'from' | 'to';
  headingLevel?: 'h1' | 'h2' | 'h3';
  outline?: ContentOutline;
};

export function DiffConstitutionText({
  left,
  right,
  side,
  headingLevel = 'h3',
  outline,
}: DiffConstitutionTextProps) {
  const Heading = headingLevel;
  const article = side === 'from' ? left : right;
  const leftChildren = left?.children ?? [];
  const rightChildren = right?.children ?? [];
  const hasTree = leftChildren.length > 0 || rightChildren.length > 0;
  return (
    <div className="constitution-text">
      {article ? (
        <Heading id={`article-${side}-${article.articleNumber}`}>
          {articleHeading(outline, {
            articleNumber: article.articleNumber,
            title: article.title,
          })}
        </Heading>
      ) : null}
      {hasTree ? (
        <DiffNodeTree left={leftChildren} right={rightChildren} side={side} outline={outline} />
      ) : (
        <DiffBody left={left?.body ?? ''} right={right?.body ?? ''} side={side} />
      )}
    </div>
  );
}

function DiffNodeTree({
  left,
  right,
  side,
  outline,
}: {
  left: ContentNode[];
  right: ContentNode[];
  side: 'from' | 'to';
  outline?: ContentOutline;
}) {
  const aligned = alignNodes(left, right);
  return (
    <div className="node-tree">
      {aligned.map((pair, index) => {
        const node = side === 'from' ? pair.left : pair.right;
        const presentation = asOutlinePresentation(
          kindByCode(outline, pair.left?.kind ?? pair.right?.kind ?? '')?.presentation,
        );
        if (presentation === 'concatenated') {
          const leftText = concatenatedText(pair.left ? [pair.left] : []);
          const rightText = concatenatedText(pair.right ? [pair.right] : []);
          const key = `${pair.left?.id ?? 'l'}-${pair.right?.id ?? 'r'}-${index}`;
          if (side === 'from' && !pair.left) {
            return null;
          }
          if (side === 'to' && !pair.right) {
            return null;
          }
          return <DiffBody key={key} left={leftText} right={rightText} side={side} />;
        }
        if (!node) {
          return null;
        }
        return (
          <DiffSectionNode
            key={node.id}
            left={pair.left}
            right={pair.right}
            side={side}
            outline={outline}
          />
        );
      })}
    </div>
  );
}

function DiffSectionNode({
  left,
  right,
  side,
  outline,
}: {
  left?: ContentNode;
  right?: ContentNode;
  side: 'from' | 'to';
  outline?: ContentOutline;
}) {
  const node = side === 'from' ? left : right;
  if (!node) {
    return null;
  }
  const kind = kindByCode(outline, node.kind);
  const heading = nodeHeading(kind, node);
  return (
    <section className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{heading}</p> : null}
      {node.body || left?.body || right?.body ? (
        <DiffBody left={left?.body ?? ''} right={right?.body ?? ''} side={side} />
      ) : null}
      {left?.children.length || right?.children.length ? (
        <DiffNodeTree left={left?.children ?? []} right={right?.children ?? []} side={side} outline={outline} />
      ) : null}
    </section>
  );
}

function DiffBody({ left, right, side }: { left: string; right: string; side: 'from' | 'to' }) {
  const segs = segsForSide(diffText(left, right), side);
  if (segs.length === 0) {
    return <p className="constitution-body muted">No text in this version.</p>;
  }
  return (
    <p className="constitution-body">
      {segs.map((seg, index) => (
        <DiffMark key={`${seg.type}-${index}`} seg={seg} />
      ))}
    </p>
  );
}

function DiffMark({ seg }: { seg: DiffSeg }) {
  if (seg.type === 'add') {
    return <ins className="diff-add">{seg.text}</ins>;
  }
  if (seg.type === 'remove') {
    return <del className="diff-remove">{seg.text}</del>;
  }
  return <span>{seg.text}</span>;
}
