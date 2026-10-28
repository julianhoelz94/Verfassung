import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import type { ArticleSummary, ContentNode, ContentOutline, OrderedEntry, OrderedNode } from '../../lib/api';
import { articleHeading, asOutlinePresentation, concatenatedText, effectiveDisplayKind, kindByCode, nodeHeading } from '../../lib/outline';
import { OrderedContentTree, type ConstitutionCrossRefs } from './ConstitutionText';
import { LocalizedTitle } from './LocalizedRegion';
import { alignNodes, diffText, segsForSide, type DiffSeg } from '../../lib/text-diff';
import { InlineText } from './InlineText';
import { FootnoteMarker, FootnoteProvider } from './Footnotes';
import { footnoteItems, type FootnoteItem } from '../../lib/footnotes';

type ArticleLike = Pick<ArticleSummary, 'articleNumber' | 'title' | 'body' | 'children' | 'content' | 'kind' | 'legacyIdentity'>;

type DiffConstitutionTextProps = {
  left?: ArticleLike;
  right?: ArticleLike;
  side: 'from' | 'to';
  headingLevel?: 'h1' | 'h2' | 'h3';
  showHeading?: boolean;
  outline?: ContentOutline;
  oppositeOutline?: ContentOutline;
  lang?: string;
  footnotes?: FootnoteItem[];
  crossRefs?: ConstitutionCrossRefs;
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
  footnotes,
  crossRefs,
}: DiffConstitutionTextProps) {
  const Heading = headingLevel;
  const article = side === 'from' ? left : right;
  const rootKind = effectiveDisplayKind(kindByCode(outline, article?.kind ?? outline?.kinds[0]?.kindCode ?? 'article'));
  const other = side === 'from' ? right : left;
  const rootLabel = article ? segsForSide(diffText(left?.articleNumber ?? '', right?.articleNumber ?? ''), side).map((seg, index) => <DiffMark key={index} seg={seg} />) : null;
  const heading = article ? articleHeading(outline, article) : '';
  const oppositeHeading = other ? articleHeading(oppositeOutline ?? outline, other) : '';
  const rootHeading = segsForSide(side === 'from' ? diffText(heading, oppositeHeading) : diffText(oppositeHeading, heading), side);
  const leftChildren = left?.children ?? [];
  const rightChildren = right?.children ?? [];
  const hasTree = leftChildren.length > 0 || rightChildren.length > 0;
  return (
    <FootnoteProvider notes={footnotes ?? footnoteItems(article?.content ?? [])}><div className="constitution-text text-column" lang={lang}>
      {showHeading && heading ? <Heading>{rootHeading.map((seg, index) => <DiffMark key={index} seg={seg} />)}</Heading> : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'inline' ? <span className="num">{rootLabel}</span> : null}
      {article && rootKind?.showLabel && rootKind.labelPlacement === 'superscript' ? <sup className="num">{rootLabel}</sup> : null}
      {left?.content != null || right?.content != null ? (
        <OrderedDiff entries={article?.content ?? []} opposite={(side === 'from' ? right : left)?.content ?? []} side={side} outline={outline} oppositeOutline={oppositeOutline ?? outline} legacyIdentity={Boolean(left?.legacyIdentity && right?.legacyIdentity)} crossRefs={crossRefs} />
      ) : hasTree ? (
        <DiffNodeTree left={leftChildren} right={rightChildren} side={side} outline={outline} />
      ) : (
        <DiffBody left={left?.body ?? ''} right={right?.body ?? ''} side={side} />
      )}
    </div></FootnoteProvider>
  );
}

function OrderedDiff({ entries, opposite, side, outline, oppositeOutline, legacyIdentity, crossRefs }: { entries: OrderedEntry[]; opposite: OrderedEntry[]; side: 'from' | 'to'; outline?: ContentOutline; oppositeOutline?: ContentOutline; legacyIdentity: boolean; crossRefs?: ConstitutionCrossRefs }) {
  const textIdentities = new Map<string, OrderedEntry>();
  const nodeIdentities = new Map<string, OrderedNode>();
  const texts = new Map<OrderedEntry, OrderedEntry>();
  const nodes = new Map<OrderedNode, OrderedNode>();
  function collect(content: OrderedEntry[]) {
    for (const entry of content) {
      if (entry.node) { nodeIdentities.set(entry.node.logicalId, entry.node); collect(entry.node.content); }
      else if (entry.logicalId) textIdentities.set(entry.logicalId, entry);
    }
  }
  collect(opposite);
  function pair(content: OrderedEntry[], other: OrderedEntry[]) {
    const remaining = new Set(other);
    const selected = new Map<OrderedEntry, OrderedEntry>();
    // Reserve stable identities before considering any legacy display-label match.
    for (const entry of content) {
      const identity = entry.node ? nodeIdentities.get(entry.node.logicalId) : entry.logicalId ? textIdentities.get(entry.logicalId) : undefined;
      const match = identity ? other.find((candidate) => entry.node ? candidate.node === identity : candidate === identity) : undefined;
      if (match) { selected.set(entry, match); remaining.delete(match); }
    }
    for (const entry of content) {
      let match = selected.get(entry);
      if (!match && legacyIdentity) {
        match = other.find((candidate) => remaining.has(candidate) && (entry.node ? candidate.node?.kind === entry.node.kind && candidate.node.label === entry.node.label : !candidate.node));
        if (match) remaining.delete(match);
      }
      if (entry.node) {
        const counterpart = nodeIdentities.get(entry.node.logicalId) ?? match?.node;
        if (counterpart) nodes.set(entry.node, counterpart);
        pair(entry.node.content, counterpart?.content ?? []);
      } else {
        const counterpart = (entry.logicalId ? textIdentities.get(entry.logicalId) : undefined) ?? match;
        if (counterpart) texts.set(entry, counterpart);
      }
    }
  }
  pair(entries, opposite);
  function marks(value: string, other: string) {
    const segments = segsForSide(side === 'from' ? diffText(value, other) : diffText(other, value), side);
    return segments.map((segment, index) => <DiffMark key={index} seg={segment} />);
  }
  function richMarks(entry: OrderedEntry, start = 0, end = (entry.text ?? '').length) {
    const value = entry.text ?? '', other = texts.get(entry)?.text ?? '';
    const segments = segsForSide(side === 'from' ? diffText(value, other) : diffText(other, value), side);
    let offset = 0;
    return segments.map((segment, index) => {
      const from = Math.max(start, offset), to = Math.min(end, offset + segment.text.length);
      offset += segment.text.length;
      return to > from ? <InlineText key={index} text={value} marks={entry.marks} start={from} end={to} render={text => <DiffMark seg={{ ...segment, text }} />} /> : null;
    });
  }
  return <OrderedContentTree entries={entries} outline={outline} crossRefs={crossRefs} idPrefix={`diff-${side}-`}
    renderText={(entry) => {
      const rendered = richMarks(entry);
      return JSON.stringify(entry.marks ?? []) === JSON.stringify(texts.get(entry)?.marks ?? []) ? rendered : <LocalizedTitle className="diff-cell-changed" label={{ en: 'Text formatting changed', de: 'Textformatierung geändert' }}>{rendered}</LocalizedTitle>;
    }}
    renderTextSlice={(entry, start, end) => richMarks(entry, start, end)}
    renderTableCell={(cell, entry) => {
      const other = texts.get(entry)?.table?.rows.flatMap(row => row.cells).find(candidate => candidate.logicalId === cell.logicalId);
      const metadataChanged = other && (other.header !== cell.header || other.rowSpan !== cell.rowSpan || other.colSpan !== cell.colSpan || JSON.stringify(other.headers ?? []) !== JSON.stringify(cell.headers ?? []));
      return metadataChanged ? <LocalizedTitle className="diff-cell-changed" label={ui.accessibilityDynamic.tableCellChanged}>{marks(cell.text, other.text)}</LocalizedTitle> : marks(cell.text, other?.text ?? '');
    }}
    renderTableCaption={(entry) => marks(entry.table?.caption ?? '', texts.get(entry)?.table?.caption ?? '')}
    renderReference={(reference, label, href, entry) => {
      const other = texts.get(entry)?.references?.find(candidate => candidate.logicalId === reference.logicalId);
      const changed = !other || JSON.stringify(other.target) !== JSON.stringify(reference.target) || other.start !== reference.start || other.end !== reference.end;
      const formatted = label ? richMarks(entry, reference.start, reference.end) : undefined;
      const content = changed && label ? <LocalizedTitle className="diff-cell-changed" label={ui.accessibilityDynamic.referenceChanged}>{formatted}</LocalizedTitle> : formatted;
      if (reference.target.type === 'footnote' && reference.target.footnoteId) return <FootnoteMarker noteId={reference.target.footnoteId}>{content}</FootnoteMarker>;
      return href ? <a className="xref" href={href}>{content}</a> : <LocalizedTitle className="xref-unavailable" label={ui.accessibilityDynamic.referenceUnavailable}>{content}</LocalizedTitle>;
    }}
    renderHeading={(node, heading) => {
      const other = nodes.get(node);
      return marks(heading, other ? nodeHeading(kindByCode(oppositeOutline, other.kind), { kind: other.kind, label: other.label, number: other.label, title: other.title }) ?? '' : '');
    }}
    renderLabel={(node, label) => marks(label, nodes.get(node)?.label ?? '')}
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
        if (presentation === 'concatenated' && !pair.left?.children.length && !pair.right?.children.length) {
          const leftText = concatenatedText(pair.left ? [pair.left] : []);
          const rightText = concatenatedText(pair.right ? [pair.right] : []);
          const key = `${pair.left?.id ?? 'l'}-${pair.right?.id ?? 'r'}-${index}`;
          if (side === 'from' && !pair.left) {
            return null;
          }
          if (side === 'to' && !pair.right) {
            return null;
          }
          const kind = effectiveDisplayKind(kindByCode(outline, node?.kind ?? ''));
          return <DiffBody key={key} left={leftText} right={rightText} side={side}
            leftLabel={pair.left?.label ?? pair.left?.number} rightLabel={pair.right?.label ?? pair.right?.number}
            labelPlacement={kind?.showLabel ? kind.labelPlacement : undefined} />;
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
  const kind = effectiveDisplayKind(kindByCode(outline, node.kind));
  const heading = nodeHeading(kind, node);
  return (
    <section className={`node-block node-kind-${node.kind}`}>
      {heading ? <p className="node-heading">{heading}</p> : null}
      {node.body || left?.body || right?.body ? (
        <DiffBody left={left?.body ?? ''} right={right?.body ?? ''} side={side}
          leftLabel={left?.label ?? left?.number} rightLabel={right?.label ?? right?.number}
          labelPlacement={kind?.showLabel ? kind.labelPlacement : undefined} />
      ) : null}
      {left?.children.length || right?.children.length ? (
        <DiffNodeTree left={left?.children ?? []} right={right?.children ?? []} side={side} outline={outline} />
      ) : null}
    </section>
  );
}

function DiffBody({ left, right, side, leftLabel, rightLabel, labelPlacement }: {
  left: string; right: string; side: 'from' | 'to';
  leftLabel?: string | null; rightLabel?: string | null; labelPlacement?: string;
}) {
  const segs = segsForSide(diffText(left, right), side);
  if (segs.length === 0) {
    return <p className="constitution-body muted"><T value={ui.components.diffconstitutiontext.noTextInThisVersion} /></p>;
  }
  return (
    <p className="constitution-body">
      {['inline', 'superscript'].includes(labelPlacement ?? '') ? <DiffLabel left={leftLabel ?? ''} right={rightLabel ?? ''} side={side} superscript={labelPlacement === 'superscript'} /> : null}
      {segs.map((seg, index) => (
        <DiffMark key={`${seg.type}-${index}`} seg={seg} />
      ))}
    </p>
  );
}

function DiffLabel({ left, right, side, superscript }: { left: string; right: string; side: 'from' | 'to'; superscript: boolean }) {
  const marks = segsForSide(diffText(left, right), side).map((seg, index) => <DiffMark key={index} seg={seg} />);
  return superscript ? <sup className="num">{marks}</sup> : <span className="num">{marks}</span>;
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
