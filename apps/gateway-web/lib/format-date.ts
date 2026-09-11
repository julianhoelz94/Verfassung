import { createElement, Fragment, type ReactNode } from 'react';

export function formatDate(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

type FormattedDateProps = {
  value?: string | null;
  fallback?: string;
  children?: ReactNode;
  className?: string;
};

export function FormattedDate({ value, fallback = 'Not recorded', children, className }: FormattedDateProps) {
  const content = children ?? fallback;
  if (!value) {
    if (className) {
      return createElement('span', { className }, content);
    }
    return createElement(Fragment, null, content);
  }
  return createElement('time', { dateTime: value, className }, formatDate(value));
}
