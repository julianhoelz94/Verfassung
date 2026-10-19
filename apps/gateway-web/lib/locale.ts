import supportedLanguages from './supported-languages.json';
export const availableLocales = supportedLanguages as readonly ('en' | 'de')[];
export type Locale = (typeof availableLocales)[number];
export type LanguagePreference = 'auto' | Locale;

function supportedLocale(tag: string): Locale | null {
  const base = tag.trim().toLowerCase().split('-')[0];
  return availableLocales.find((locale) => locale === base) ?? null;
}

export function resolveLocale(preference: string | undefined, acceptLanguage: string | null, enabled: readonly string[] = availableLocales, fallback: string = 'en'): Locale {
  const valid = availableLocales.filter(locale => enabled.includes(locale));
  const defaultLocale = valid.find(locale => locale === fallback) ?? valid[0] ?? 'en';
  if (preference && preference !== 'auto') {
    const selected = supportedLocale(preference);
    return selected && valid.includes(selected) ? selected : defaultLocale;
  }
  const choices = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(';');
      const q = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const weight = q ? Number(q.trim().slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((choice) => choice.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const choice of choices) {
    const locale = supportedLocale(choice.tag);
    if (locale && valid.includes(locale)) return locale;
  }
  return defaultLocale;
}
