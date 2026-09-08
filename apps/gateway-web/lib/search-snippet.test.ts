import { describe, expect, it } from 'vitest';
import { snippetParts } from './search-snippet';

describe('snippetParts', () => {
  it('returns plain text when there are no marks', () => {
    expect(snippetParts('Human dignity shall be inviolable.')).toEqual([
      { text: 'Human dignity shall be inviolable.', mark: false },
    ]);
  });

  it('splits only on mark tags', () => {
    expect(snippetParts('Human <mark>dignity</mark> shall be inviolable.')).toEqual([
      { text: 'Human ', mark: false },
      { text: 'dignity', mark: true },
      { text: ' shall be inviolable.', mark: false },
    ]);
  });

  it('leaves other tags as plain text', () => {
    expect(snippetParts('A <b>bold</b> <mark>hit</mark>.')).toEqual([
      { text: 'A <b>bold</b> ', mark: false },
      { text: 'hit', mark: true },
      { text: '.', mark: false },
    ]);
  });
});
