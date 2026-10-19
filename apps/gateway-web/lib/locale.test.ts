import { describe, expect, it } from 'vitest';
import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('uses the saved account choice over the device language', () => {
    expect(resolveLocale('de', 'en-US,en;q=0.8')).toBe('de');
    expect(resolveLocale('en', 'de-DE,de;q=0.9')).toBe('en');
  });

  it('uses the highest ranked supported device language', () => {
    expect(resolveLocale('auto', 'fr-FR, de-CH;q=0.8, en;q=0.5')).toBe('de');
    expect(resolveLocale(undefined, 'de-DE,de;q=0.9,en;q=0.8')).toBe('de');
  });

  it('falls back to English for unsupported or absent languages', () => {
    expect(resolveLocale('auto', 'fr-FR,es;q=0.8')).toBe('en');
    expect(resolveLocale('auto', null)).toBe('en');
    expect(resolveLocale('fr', 'de;q=1')).toBe('en');
  });

  it('does not select a language with zero quality', () => {
    expect(resolveLocale('auto', 'de;q=0,en;q=0.5')).toBe('en');
  });
});

describe('deployment language policy', () => {
  it('falls back when the saved preference is disabled', () => {
    expect(resolveLocale('en', 'en-US', ['de'], 'de')).toBe('de');
  });
  it('ignores disabled device choices and uses the configured default', () => {
    expect(resolveLocale('auto', 'en;q=1,de;q=0.5', ['de'], 'de')).toBe('de');
    expect(resolveLocale('auto', null, ['en', 'de'], 'de')).toBe('de');
  });
});
