'use client';

import { useState } from 'react';
import type { SearchFacets } from '../../lib/api';
import { ui } from '../../lib/messages';
import { usability } from '../../lib/usability-messages';
import { T, useTranslation } from './TranslationProvider';
import fieldStyles from './fields.module.css';

type Option = { value: string; label: string };

function SearchableSelect({ name, label, anyLabel, options, value, onChange }: {
  name: string; label: string; anyLabel: string; options: Option[]; value: string; onChange: (value: string) => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const matching = options.filter(option => option.value === value || option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className={["field searchable-filter", fieldStyles.field].join(' ')}>
    <label htmlFor={`filter-${name}`}>{label}</label>
    {options.length > 8 ? <input type="search" aria-label={`${t(usability.findOption)}: ${label}`} placeholder={t(usability.findOption)} value={query} onChange={event => setQuery(event.target.value)} /> : null}
    <select id={`filter-${name}`} name={name} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{anyLabel}</option>
      {matching.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {query && !matching.some(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ? <p role="status" className="muted"><T value={usability.noOptions} /></p> : null}
  </div>;
}

export function SearchFilters({ facets, country: initialCountry, versionId: initialVersion, effectiveDate }: {
  facets: SearchFacets; country: string; versionId: string; effectiveDate: string;
}) {
  const t = useTranslation();
  const [country, setCountry] = useState(initialCountry);
  const [versionId, setVersionId] = useState(initialVersion);
  const [clearedVersion, setClearedVersion] = useState(false);
  const versions = facets.versions.filter(version => !country || version.countryCode === country);
  return <div className="search-filter-fields">
    <SearchableSelect name="country" label={t(ui.search.page.country)} anyLabel={t(ui.search.page.anyCountry)}
      options={facets.countries.map(facet => ({ value: facet.code, label: `${facet.countryName || facet.code} (${facet.count})` }))}
      value={country} onChange={nextCountry => {
        setCountry(nextCountry);
        const selected = facets.versions.find(version => version.id === versionId);
        const clear = Boolean(nextCountry && selected && selected.countryCode !== nextCountry);
        if (clear) setVersionId('');
        setClearedVersion(clear);
      }} />
    <SearchableSelect key={country} name="versionId" label={t(ui.search.page.version)} anyLabel={t(ui.search.page.anyVersion)}
      options={versions.map(facet => ({ value: facet.id, label: `${facet.constitutionTitle} · ${facet.label} (${facet.count})` }))}
      value={versionId} onChange={setVersionId} />
    {clearedVersion ? <p role="status" className="muted"><T value={usability.countryChanged} /></p> : null}
    <div className={["field", fieldStyles.field].join(' ')}><label htmlFor="filter-effectiveDate"><T value={ui.search.page.effectiveDate} /></label>
      <select id="filter-effectiveDate" name="effectiveDate" defaultValue={effectiveDate}>
        <option value=""><T value={ui.search.page.anyDate} /></option>
        {facets.dates.map(facet => <option key={facet.effectiveDate} value={facet.effectiveDate}>{facet.effectiveDate} ({facet.count})</option>)}
      </select>
    </div>
  </div>;
}
