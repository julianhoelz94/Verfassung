// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { absoluteUrl, publicBaseUrl } from './site-url';

describe('publicBaseUrl', () => {
  afterEach(() => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it('prefers PUBLIC_BASE_URL', () => {
    process.env.PUBLIC_BASE_URL = 'https://atlas.example';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://ignored.example';
    expect(publicBaseUrl()).toBe('https://atlas.example');
  });

  it('falls back to NEXT_PUBLIC_BASE_URL then localhost', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://public.example';
    expect(publicBaseUrl()).toBe('https://public.example');
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(publicBaseUrl()).toBe('http://localhost');
  });
});

describe('absoluteUrl', () => {
  afterEach(() => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it('joins base and path without double slashes', () => {
    process.env.PUBLIC_BASE_URL = 'https://atlas.example/';
    expect(absoluteUrl('/countries/DE')).toBe('https://atlas.example/countries/DE');
  });

  it('adds a leading slash when missing', () => {
    process.env.PUBLIC_BASE_URL = 'https://atlas.example';
    expect(absoluteUrl('search')).toBe('https://atlas.example/search');
  });
});
