import type { ReactNode } from 'react';
import type { SourceEvidence } from '../../lib/api';
import { sourceDescriptionText } from '../../lib/source-evidence';
import { httpUrl } from '../../lib/provenance';
import { WikiBody } from './WikiBody';

function sourceLinks(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let position = 0;
  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    const index = match.index!;
    parts.push(text.slice(position, index));
    const href = httpUrl(match[2]);
    parts.push(href ? <a key={index} href={href} rel="noreferrer">{match[1]}</a> : match[0]);
    position = index + match[0].length;
  }
  parts.push(text.slice(position));
  return parts;
}

export function SourceDescription({ evidence }: { evidence?: SourceEvidence | null }) {
  return <WikiBody body={sourceDescriptionText(evidence)} renderInline={sourceLinks} />;
}
