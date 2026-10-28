import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { InlineText } from './InlineText';
import { DiffConstitutionText } from './DiffConstitutionText';
import { netArticleKind } from '../../lib/compare';
import type { ArticleSummary, OrderedEntry } from '../../lib/api';

it('renders combined exact ranges without treating strikethrough as a legal deletion', () => {
  const html = renderToStaticMarkup(<InlineText text="Exact wording." marks={[
    { type: 'bold', start: 0, end: 5 }, { type: 'italic', start: 0, end: 5 },
    { type: 'underline', start: 6, end: 13 }, { type: 'strikethrough', start: 6, end: 13 },
  ]} />);
  expect(html).toBe('<strong><em>Exact</em></strong> <u><s>wording</s></u>.');
  expect(html).not.toContain('<del');
});

it('shows formatting-only comparisons as a change with the correct semantic marks on either side', () => {
  const entry: OrderedEntry = { type: 'text', logicalId: 'text', text: 'Original wording.' };
  const article = (id: string, content: OrderedEntry[]): ArticleSummary => ({ id, logicalId: 'article', versionId: id, articleNumber: '1', title: '', sortOrder: 1, content });
  const left = article('source', [entry]), right = article('target', [{ ...entry, marks: [{ type: 'bold', start: 0, end: 8 }] }]);
  expect(netArticleKind(left, right, [])).toBe('changed');
  const html = renderToStaticMarkup(<DiffConstitutionText left={left} right={right} side="to" />);
  expect(html).toContain('<strong>');
  expect(html).toContain('Text formatting changed');
  expect(html).not.toContain('diff-remove');
});
