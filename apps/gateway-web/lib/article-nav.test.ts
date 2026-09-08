import { describe, expect, it } from 'vitest';
import { neighborsOf } from './article-nav';

const articles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('neighborsOf', () => {
  it('hides previous on the first article', () => {
    expect(neighborsOf(articles, 'a')).toEqual({ previous: undefined, next: articles[1] });
  });

  it('returns both neighbors in the middle', () => {
    expect(neighborsOf(articles, 'b')).toEqual({ previous: articles[0], next: articles[2] });
  });

  it('hides next on the last article', () => {
    expect(neighborsOf(articles, 'c')).toEqual({ previous: articles[1], next: undefined });
  });

  it('returns nothing for an unknown id', () => {
    expect(neighborsOf(articles, 'missing')).toEqual({ previous: undefined, next: undefined });
  });
});
