import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { sourceDescriptionText } from '../../lib/source-evidence';
import { SourceDescription } from './SourceDescription';

describe('free source descriptions', () => {
  it('retains every legacy source paragraph when opening the editor', () => {
    expect(sourceDescriptionText({ dateWording: 'Date', datePrecision: 'day', coverage: 'Excerpt', statusWording: 'Status', attribution: 'Archive' }))
      .toBe('Date\n\nExcerpt\n\nStatus\n\nArchive');
    expect(sourceDescriptionText({ datePrecision: 'unknown', coverage: 'Legacy', description: '' })).toBe('');
  });
  it('renders headings, paragraphs, lists and safe links without executing HTML or unsafe links', () => {
    const html = renderToStaticMarkup(<SourceDescription evidence={{ datePrecision: 'unknown', description: '# Archive\n\n- [Official text](https://example.org/source)\n- Second source\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))' }} />);
    expect(html).toContain('<h3>Archive</h3>');
    expect(html).toContain('<ul>');
    expect(html).toContain('href="https://example.org/source"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});
