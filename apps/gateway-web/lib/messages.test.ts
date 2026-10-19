import { describe, expect, it } from 'vitest';
import { message, ui } from './messages';

describe('prepared UI messages', () => {
  it('keeps both languages in each typed message variable', () => {
    expect(ui.account.page.saveLanguage).toEqual({ en: 'Save language', de: 'Sprache speichern' });
  });

  it('selects copy from the variable with the chosen language', () => {
    expect(message('de', ui.account.page.saveLanguage)).toBe('Sprache speichern');
    expect(message('en', ui.account.page.saveLanguage)).toBe('Save language');
  });
});
