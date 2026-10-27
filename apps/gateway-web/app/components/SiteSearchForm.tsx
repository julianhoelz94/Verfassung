'use client';

import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useTranslation } from './TranslationProvider';
import type { UiMessage } from '../../lib/messages';
type SiteSearchFormProps = {
  id: string;
  className?: string;
  versionId?: string;
  country?: string;
  jurisdictionId?: string;
  submitVisible?: boolean;
  label?: UiMessage;
  placeholder?: UiMessage;
  visibleLabel?: boolean;
  submitClassName?: string;
  ariaLabel?: UiMessage;
};

export function SiteSearchForm({
  id,
  className,
  versionId,
  country,
  jurisdictionId,
  submitVisible = true,
  label,
  placeholder,
  visibleLabel = false,
  submitClassName,
  ariaLabel,
}: SiteSearchFormProps) {
  const t = useTranslation();
  const inputId = `${id}-q`;
  const fieldLabel = t(label ?? (versionId ? ui.searchForm.searchInVersion : ui.searchForm.searchArticles));
  return (
    <form
      className={className}
      action="/search"
      method="get"
      role="search"
      aria-label={ariaLabel ? t(ariaLabel) : fieldLabel}
    >
      {jurisdictionId ? <input type="hidden" name="jurisdictionId" value={jurisdictionId} /> : null}
      {country ? <input type="hidden" name="country" value={country} /> : null}
      {versionId ? <input type="hidden" name="versionId" value={versionId} /> : null}
      <label htmlFor={inputId} className={visibleLabel ? undefined : 'visually-hidden'}>
        {fieldLabel}
      </label>
      <input id={inputId} type="search" name="q" placeholder={placeholder ? t(placeholder) : fieldLabel} />
      <button type="submit" className={submitVisible ? submitClassName : 'visually-hidden'}>
        <T value={ui.components.sitesearchform.search} />{" "}</button>
    </form>
  );
}
