import { directoryUi } from '../../lib/country-directory-messages';
import { FormattedDate } from '../../lib/format-date';
import { T } from './TranslationProvider';

export function JurisdictionDates({ from, until }: { from?: string | null; until?: string | null }) {
  if (!from && !until) return null;
  return <span>{from && until ? <><FormattedDate value={from} /> – <FormattedDate value={until} /></> : <><T value={from ? directoryUi.existedFrom : directoryUi.existedUntil} /> <FormattedDate value={from ?? until} /></>}</span>;
}
