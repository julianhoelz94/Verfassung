import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { linkifyReferences } from './crossrefs';

const en = {
  code: 'DE',
  versionId: 'v1',
  articlesByNumber: { '1': 'id-1', '20': 'id-20', '16a': 'id-16a' },
  kindLabel: 'Article',
};

function html(text: string, context = en): string {
  return renderToStaticMarkup(createElement('p', null, linkifyReferences(text, context)));
}

describe('linkifyReferences', () => {
  it('links an English Article number that exists', () => {
    const markup = html('See Article 1 for dignity.');
    expect(markup).toContain('href="/countries/DE/versions/v1/articles/id-1"');
    expect(markup).toContain('Article 1');
  });

  it('links two English references in one string', () => {
    const markup = html('Read Article 1 then Article 20.');
    expect(markup).toContain('articles/id-1');
    expect(markup).toContain('articles/id-20');
  });

  it('leaves a non-existent number as plain text', () => {
    const markup = html('Article 99 is not in this version.');
    expect(markup).not.toContain('href=');
    expect(markup).toContain('Article 99');
  });

  it('does not treat Art. as English Article', () => {
    const markup = html('Art. 1 is abbreviated.');
    expect(markup).not.toContain('href=');
  });

  it('links German Art. and Artikel when the outline label is Artikel', () => {
    const de = { ...en, kindLabel: 'Artikel' };
    expect(html('Siehe Art. 1.', de)).toContain('articles/id-1');
    expect(html('Artikel 16a gilt.', de)).toContain('articles/id-16a');
    expect(html('Artikel 99 fehlt.', de)).not.toContain('href=');
  });
});
