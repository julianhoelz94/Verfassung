import { createElement, Fragment, type ReactNode } from 'react';

export type CrossRefContext = {
  code: string;
  versionId: string;
  articlesByNumber: Record<string, string>;
  kindLabel: string;
};

export function referencePattern(kindLabel: string): RegExp {
  const label = kindLabel.trim();
  if (/^article$/i.test(label)) {
    return /\bArticle\s+(\d+[a-z]?)\b/gi;
  }
  return /\bArt(?:ikel|\.)\s*(\d+[a-z]?)\b/gi;
}

function articleIdFor(articlesByNumber: Record<string, string>, articleNumber: string): string | undefined {
  return articlesByNumber[articleNumber] ?? articlesByNumber[articleNumber.toLowerCase()];
}

export function linkifyReferences(text: string, context: CrossRefContext): ReactNode {
  const pattern = referencePattern(context.kindLabel);
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const number = match[1];
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const articleId = number ? articleIdFor(context.articlesByNumber, number) : undefined;
    if (articleId) {
      parts.push(
        createElement(
          'a',
          {
            key: `${match.index}-${number}`,
            className: 'xref',
            href: `/countries/${context.code}/versions/${context.versionId}/articles/${articleId}`,
          },
          match[0],
        ),
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  if (parts.length === 1 && typeof parts[0] === 'string') {
    return parts[0];
  }
  return createElement(Fragment, null, ...parts);
}
