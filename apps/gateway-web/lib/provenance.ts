import { message, ui } from './messages';
import type { Locale } from './locale';

export function httpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function provenanceLabel(provenance: string, locale: Locale = 'en'): string {
  switch (provenance) {
    case 'official':
      return message(locale, ui.remainingStatus.officialText);
    case 'imported':
      return message(locale, ui.remainingStatus.importedText);
    case 'demo':
      return message(locale, ui.remainingStatus.demoText);
    default:
      return message(locale, ui.remainingStatus.sourceKindUnknown);
  }
}

export function verificationLabel(version: {
  verificationState: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}, locale: Locale = 'en'): string {
  if (version.verificationState === 'verified') {
    const who = version.verifiedBy ? ` ${message(locale, ui.remainingStatus.verifiedBy)} ${version.verifiedBy}` : '';
    const when = version.verifiedAt ? ` ${message(locale, ui.remainingStatus.verifiedOn)} ${new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(version.verifiedAt))}` : '';
    return `${message(locale, ui.remainingStatus.verified)}${who}${when}`;
  }
  return message(locale, ui.remainingStatus.notVerified);
}
