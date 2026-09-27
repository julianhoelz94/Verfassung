import type { ArticleSummary, ContentNode, ContentOutline, OrderedEntry, OrderedNode } from '../../lib/api';
import { articleHeading, asOutlinePresentation, concatenatedText, kindByCode, nodeHeading } from '../../lib/outline';
import { OrderedContentTree } from './ConstitutionText';
import { alignNodes, diffText, segsForSide, type DiffSeg } from '../../lib/text-diff';

type ArticleLike = Pick<ArticleSummary, 'articleNumber' | 'title' | 'body' | 'children' | 'content' | 'kind'>;

type DiffConstitutionTextProps = {
  left?: ArticleLike;
  right?: ArticleLike;
  side: 'from' | 'to';
  headingLevel?: 'h1' | 'h2' | 'h3';
  showHeading?: boolean;
  outline?: ContentOutline;
  oppositeOutline?: ContentOutline;
  lang?: string;
};

export function DiffConstitutionText({
  left,
  right,
  side,
  headingLevel = 'h3',
  showHeading = true,
  outline,
  oppositeOutline,
  lang,
}: DiffConstitutionTextProps) {
  const Heading = headingLevel;
  const article = side === 'from' ? left : right;
  const rootKind = kindByCode(outline, article?.kind ?? outline?.kinds[0]?.kindCode ?? 'article');
  const other = side === 'from' ? right : left;
  const rootLabel = article ? segsForSide(diffText(left?.articleNumber ?? '', right?.articleNumber ?? ''), side).map((seg, index) => <DiffMark key={index} seg={seg} />) : null;
  const heading = article ? articleHeading(outline, article) : '';
  const oppositeHeading = other ? articleHeading(oppositeOutline ?? outline, other) : '';
  const rootHeading = segsForSide(side === 'from' ? diffText(heading, oppositeHeading) : diffText(oppositeHeading, heading), side);
  const leftChildren = left?.children ?? [];
  const rightChildren = right?.children ?? [];
  const hasTree = leftChildren.length > 0 || rightChildren.length > 0;
  return (
    <div className="constitution-text text-column" lang={lang}>
      {showHeading && heading ? <Heading>{rootHeading.map((seg, index) => <DiffMark key={index} seg={seg} />)}</Heading> : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'inline' ? <span className="num">{rootLabel}</span> : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'superscript' ? <sup className="num">{rootLabel}</sup> : null}
      {left?.content != null || right?.content != null ? (
        <OrderedDiff entries={article?.content ?? []} opposite={(side === 'from' ? right : left)?.content ?? []} side={side} outline={outline} oppositeOutline={oppositeOutline ?? outline} />
      ) : hasTree ? (
        <DiffNodeTree left={leftChildren} right={rightChildren} side={side} outline={outline} />
      ) : (
        <DiffBody left={left?.body ?? ''} right={right?.body ?? ''} side={side} />
      )}
    </div>
  );
}

function OrderedDiff({ entries, opposite, side, outline, oppositeOutline }: { entries: OrderedEntry[]; opposite: OrderedEntry[]; side: 'from' | 'to'; outline?: ContentOutline; oppositeOutline?: ContentOutline }) {
  const texts = new Map<string, OrderedEntry>();
  const nodes = new Map<string, OrderedNode>();
  function collect(content: OrderedEntry[]) {
    for (const entry of content) {
      if (entry.node) { nodes.set(entry.node.logicalId, entry.node); collect(entry.node.content); }
      else if (entry.logicalId) texts.set(entry.logicalId, entry);
    }
  }
  collect(opposite);
  function marks(value: string, other: string) {
    const segments = segsForSide(side === 'from' ? diffText(value, other) : diffText(other, value), side);
    return segments.map((segment, index) => <DiffMark key={index} seg={segment} />);
  }
  return <OrderedContentTree entries={entries} outline={outline} idPrefix={`diff-${side}-`}
    renderText={(entry) => marks(entry.text ?? '', entry.logicalId ? texts.get(entry.logicalId)?.text ?? '' : '')}
    renderHeading={(node, heading) => {
      const other = nodes.get(node.logicalId);
      return marks(heading, other ? nodeHeading(kindByCode(oppositeOutline, other.kind), { kind: other.kind, label: other.label, number: other.label, title: other.title }) ?? '' : '');
    }}
    renderLabel={(node, label) => marks(label, nodes.get(node.logicalId)?.label ?? '')}
  />;
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
