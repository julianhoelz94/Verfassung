type SiteSearchFormProps = {
  id: string;
  className?: string;
  versionId?: string;
  country?: string;
  submitVisible?: boolean;
  label?: string;
  placeholder?: string;
  visibleLabel?: boolean;
  submitClassName?: string;
  ariaLabel?: string;
};

export function SiteSearchForm({
  id,
  className,
  versionId,
  country,
  submitVisible = true,
  label,
  placeholder,
  visibleLabel = false,
  submitClassName,
  ariaLabel,
}: SiteSearchFormProps) {
  const inputId = `${id}-q`;
  const fieldLabel = label ?? (versionId ? 'Search in this version' : 'Search articles');
  return (
    <form
      className={className}
      action="/search"
      method="get"
      role="search"
      aria-label={ariaLabel ?? fieldLabel}
    >
      {country ? <input type="hidden" name="country" value={country} /> : null}
      {versionId ? <input type="hidden" name="versionId" value={versionId} /> : null}
      <label htmlFor={inputId} className={visibleLabel ? undefined : 'visually-hidden'}>
        {fieldLabel}
      </label>
      <input id={inputId} type="search" name="q" placeholder={placeholder ?? fieldLabel} />
      <button type="submit" className={submitVisible ? submitClassName : 'visually-hidden'}>
        Search
      </button>
    </form>
  );
}
