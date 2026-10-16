'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Locale } from '../../lib/locale';
import { message, type UiMessage } from '../../lib/messages';

export { ui } from '../../lib/messages';

const LocaleContext = createContext<Locale>('en');

export function TranslationProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useTranslation() {
  const locale = useContext(LocaleContext);
  return (value: UiMessage) => message(locale, value);
}

export function T({ value }: { value: UiMessage }) {
  return <>{useTranslation()(value)}</>;
}
