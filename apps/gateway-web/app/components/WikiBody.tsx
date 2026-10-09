import type { ReactNode } from 'react';

export function WikiBody({ body }: { body: string }) {
  const blocks = body.trim().split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length === 0) return null;
  return <div className="wiki-body">{blocks.map((block, index) => {
    const heading = block.includes('\n') ? null : /^(#{1,3})\s+(.+)$/.exec(block);
    if (heading) {
      const title = heading[2];
      if (heading[1].length === 1) return <h3 key={index}>{title}</h3>;
      if (heading[1].length === 2) return <h4 key={index}>{title}</h4>;
      return <h5 key={index}>{title}</h5>;
    }
    const lines = block.split('\n');
    if (lines.every((line) => /^-\s+/.test(line))) {
      return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^-\s+/, '')}</li>)}</ul>;
    }
    const content: ReactNode[] = [];
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) content.push(<br key={`break-${lineIndex}`} />);
      content.push(line);
    });
    return <p key={index}>{content}</p>;
  })}</div>;
}
