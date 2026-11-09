import { ui } from './messages';
import type { Locale } from './locale';

export const AMENDMENT_ERROR_MESSAGES = {
  sign_in: ui.errors.signIn,
  forbidden: ui.errors.forbidden,
  not_found: ui.errors.amendmentNotFound,
  invalid: ui.errors.amendmentSaveFailed,
  create_failed: ui.errors.createAmendmentFailed,
  save_failed: ui.errors.saveDraftFailed,
  documents: { en: 'The amendment was saved, but its documents could not be attached. Your selections are preserved. Retry to finish linking them.', de: 'Die Änderung wurde gespeichert, ihre Dokumente konnten jedoch nicht verknüpft werden. Deine Auswahl bleibt erhalten. Erneut versuchen, um die Verknüpfung abzuschließen.' },
  publish_failed: ui.errors.publishAmendmentFailed,
  withdraw_failed: ui.errors.withdrawAmendmentFailed,
  title: ui.errors.titleRequired,
  failed: ui.errors.amendmentFailed,
} as const;

export type AmendmentErrorKey = keyof typeof AMENDMENT_ERROR_MESSAGES;

export function amendmentErrorMessage(key: string | undefined, locale: Locale = 'en'): string | null {
  if (!key) {
    return null;
  }
  return (Object.hasOwn(AMENDMENT_ERROR_MESSAGES, key)
    ? AMENDMENT_ERROR_MESSAGES[key as AmendmentErrorKey]
    : AMENDMENT_ERROR_MESSAGES.failed)[locale];
}
