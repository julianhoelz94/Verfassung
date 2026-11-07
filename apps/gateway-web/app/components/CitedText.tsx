import { Fragment } from 'react';
import type { OrderedInlineReference, OrderedTextMark } from '../../lib/api';
import { InlineText } from './InlineText';

/** Note drawers use the same exact text offsets and revision URLs as the main reader. */
export function CitedText({ text, marks, citations = [] }: { text: string; marks?: OrderedTextMark[]; citations?: OrderedInlineReference[] }) {
  const points = [...new Set([0, text.length, ...citations.flatMap(ref => [ref.start, ref.end])])].sort((a, b) => a - b);
  return <>{points.slice(1).map((end, index) => {
    const start = points[index], reference = citations.find(ref => ref.start <= start && ref.end >= end);
    const target = reference?.target;
    const href = target?.type === 'document' && target.documentId && target.documentRevision ? `/documents/${target.documentId}?revision=${target.documentRevision}` : target?.type === 'external' ? target.url : undefined;
    const content = <InlineText text={text} start={start} end={end} marks={marks} />;
    return <Fragment key={start}>{href ? <a href={href} title={target?.locator ?? undefined}>{content}</a> : content}</Fragment>;
  })}</>;
}
