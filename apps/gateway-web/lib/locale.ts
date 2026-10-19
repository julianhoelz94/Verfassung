export const availableLocales = ['en', 'de'] as const;
export type Locale = (typeof availableLocales)[number];
export type LanguagePreference = 'auto' | Locale;

function supportedLocale(tag: string): Locale | null {
  const base = tag.trim().toLowerCase().split('-')[0];
  return availableLocales.find((locale) => locale === base) ?? null;
}

export function resolveLocale(preference: string | undefined, acceptLanguage: string | null): Locale {
  if (preference && preference !== 'auto') return supportedLocale(preference) ?? 'en';
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
    if (locale) return locale;
  }
  return 'en';
}
