import { Fragment, type ReactNode } from 'react';
import type { OrderedTextMark } from '../../lib/api';

/** Offsets refer to exact UTF-16 source text, including when rendering a reference slice. */
export function InlineText({ text, marks = [], start = 0, end = text.length, render = value => value }: {
  text: string; marks?: OrderedTextMark[]; start?: number; end?: number;
  render?: (value: string, start: number) => ReactNode;
}) {
  const points = [...new Set([start, end, ...marks.flatMap(mark => [mark.start, mark.end]).filter(point => point > start && point < end)])].sort((a, b) => a - b);
  return <>{points.slice(1).map((to, index) => {
    const from = points[index];
    let value = render(text.slice(from, to), from);
    const active = new Set(marks.filter(mark => mark.start <= from && mark.end >= to).map(mark => mark.type));
    if (active.has('strikethrough')) value = <s>{value}</s>;
    if (active.has('underline')) value = <u>{value}</u>;
    if (active.has('italic')) value = <em>{value}</em>;
    if (active.has('bold')) value = <strong>{value}</strong>;
    return <Fragment key={from}>{value}</Fragment>;
  })}</>;
}
