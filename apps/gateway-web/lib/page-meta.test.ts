// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { atlasTitle, metaDescription, pageMetadata } from './page-meta';

describe('atlasTitle', () => {
  it('joins parts with the site suffix', () => {
    expect(atlasTitle('Germany')).toBe('Germany — Constitution Atlas');
    expect(atlasTitle('1949', 'Basic Law', 'Germany')).toBe(
      '1949 · Basic Law · Germany — Constitution Atlas',
    );
  });

  it('returns the bare site name when no parts are given', () => {
    expect(atlasTitle()).toBe('Constitution Atlas');
    expect(atlasTitle('', '  ')).toBe('Constitution Atlas');
  });
});

describe('metaDescription', () => {
  it('collapses whitespace and truncates to about 160 characters', () => {
    const long = 'word '.repeat(40).trim();
    const description = metaDescription(`  ${long}  `);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('...')).toBe(true);
  });

  it('keeps short text unchanged', () => {
    expect(metaDescription('Human   dignity\nis inviolable.')).toBe('Human dignity is inviolable.');
  });
});

describe('pageMetadata', () => {
  it('sets canonical and open graph URLs from the public base', () => {
    process.env.PUBLIC_BASE_URL = 'https://atlas.example';
    const metadata = pageMetadata({
      title: 'Germany — Constitution Atlas',
      description: 'Browse Germany.',
      path: '/countries/DE',
    });
    expect(metadata.alternates?.canonical).toBe('https://atlas.example/countries/DE');
    expect(metadata.openGraph?.url).toBe('https://atlas.example/countries/DE');
    delete process.env.PUBLIC_BASE_URL;
  });
});
