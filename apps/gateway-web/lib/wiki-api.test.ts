// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiUnavailableError, getWikiDraft, getWikiPage, readJson } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('optional catalog wiki pages', () => {
  for (const target of ['country', 'constitution'] as const) {
    it(`opens an uninitialized ${target} page when Catalog returns an empty 200`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
      await expect(getWikiPage(target, 'new-target')).resolves.toBeNull();
      await expect(getWikiDraft(target, 'new-target', 'Bearer editor')).resolves.toBeNull();
    });
  }

  it('reads a saved revision normally', async () => {
    const revision = { id: 'revision', summary: 'Saved country context', images: [] };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(revision)));
    await expect(getWikiPage('country', 'target')).resolves.toEqual(revision);
  });

  it('does not hide an unavailable service or malformed JSON as a missing page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    await expect(getWikiPage('country', 'target')).rejects.toBeInstanceOf(ApiUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{')));
    await expect(getWikiPage('country', 'target')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('supports a no-content response for optional reads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(readJson('/optional', 'catalog')).resolves.toBeNull();
  });
});
