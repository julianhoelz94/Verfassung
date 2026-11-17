import { describe, expect, it } from 'vitest';
import { canonicalImportUrl, importErrorHref, importJobHref } from './import-routes';

describe('canonical import links', () => {
  it.each([
    ['/admin/import?mode=new&batch=a#structure', '/import?mode=new&batch=a#structure'],
    ['/admin/import/setup/proposal?error=stale', '/import/setup/proposal?error=stale'],
    ['/admin/import/packages/run?item=one&view=review&item=two#source', '/import/packages/run?item=one&view=review&item=two#source'],
    ['/admin/migrations?state=failed', '/import?state=failed'],
    ['/admin/migrations/run?source=archive&item=version#source', '/import/packages/run?source=archive&item=version#source'],
    ['/editor?importJobId=job%2Fone&display=compare&inbox=%2Feditor%3Fstatus%3Dreviewing#article-2', '/import/jobs/job%2Fone?display=compare&inbox=%2Feditor%3Fstatus%3Dreviewing#article-2'],
  ])('preserves a legacy destination and context: %s', (from, to) => {
    const input = new URL(from, 'https://atlas.example');
    expect(canonicalImportUrl(input)?.href).toBe('https://atlas.example' + to);
    expect(input.href).toBe('https://atlas.example' + from);
  });
  it.each(['/editor?sessionId=draft&scope=sources', '/editor?mine=1', '/editor?importJobId=', '/import/jobs/job', '/admin/importer', '/admin/import/retired-job'])('leaves ordinary/canonical routes alone: %s', href => {
    expect(canonicalImportUrl(new URL(href, 'https://atlas.example'))).toBeNull();
  });
  it('keeps a supplied identifier in an encoded same-origin path segment', () => {
    const next = canonicalImportUrl(new URL('https://atlas.example/editor?importJobId=https%3A%2F%2Fevil.example%2Fx'))!;
    expect(next.origin).toBe('https://atlas.example');
    expect(next.pathname).toBe('/import/jobs/https%3A%2F%2Fevil.example%2Fx');
    expect(importJobHref('job/one', { display: 'source' })).toBe('/import/jobs/job%2Fone?display=source');
  });
  it('adds an error before the fragment and retains package selection', () => {
    expect(importErrorHref('/import/jobs/job#article', 'reason')).toBe('/import/jobs/job?error=reason#article');
    expect(importErrorHref('/import/packages/run?item=version&view=review&error=old#source', 'stale')).toBe('/import/packages/run?item=version&view=review&error=stale#source');
  });
});
