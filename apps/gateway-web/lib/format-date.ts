'use client';

import { createElement, Fragment, type ReactNode } from 'react';
import { useLocale } from '../app/components/TranslationProvider';
import { ui } from './messages';

export function formatDate(iso: string, locale: string = 'en'): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

type FormattedDateProps = {
  value?: string | null;
  fallback?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function FormattedDate({ value, fallback, children, className }: FormattedDateProps) {
  const locale = useLocale();
  const content = children ?? fallback ?? ui.remainingStatus.notRecorded[locale];
  if (!value) {
    if (className) {
      return createElement('span', { className }, content);
    }
    return createElement(Fragment, null, content);
  }
  return createElement('time', { dateTime: value, className }, formatDate(value, locale));
}
