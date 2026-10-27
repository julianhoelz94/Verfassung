'use client';

import { useState } from 'react';
import type { SearchFacets } from '../../lib/api';
import { ui } from '../../lib/messages';
import { usability } from '../../lib/usability-messages';
import { migrationUi } from '../../lib/migration-messages';
import { normalizeSearchSelection, versionMatchesSelection, type SearchSelection } from '../../lib/search-filters';
import { T, useTranslation } from './TranslationProvider';
import fieldStyles from './fields.module.css';

type Option = { value: string; label: string };

function SearchableSelect({ name, label, anyLabel, options, value, onChange, missingLabel }: {
  name: string; label: string; anyLabel: string; options: Option[]; value: string; onChange: (value: string) => void; missingLabel?: string;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const matching = options.filter(option => option.value === value || option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className={["field searchable-filter", fieldStyles.field].join(' ')}>
    <label htmlFor={`filter-${name}`}>{label}</label>
    {options.length > 8 ? <input type="search" aria-label={`${t(usability.findOption)}: ${label}`} placeholder={t(usability.findOption)} value={query} onChange={event => setQuery(event.target.value)} /> : null}
    <select id={`filter-${name}`} name={name} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{anyLabel}</option>
      {value && !options.some(option => option.value === value) ? <option value={value}>{missingLabel ?? value}</option> : null}
      {matching.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {query && !matching.some(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ? <p role="status" className="muted"><T value={usability.noOptions} /></p> : null}
  </div>;
}

export function SearchFilters({ facets, country, jurisdictionId = '', versionId, effectiveDate }: {
  facets: SearchFacets; country: string; jurisdictionId?: string; versionId: string; effectiveDate: string;
}) {
  const t = useTranslation();
  const [selection, setSelection] = useState(() => normalizeSearchSelection(facets, { country, jurisdictionId, versionId }));
  const [adjusted, setAdjusted] = useState(false);
  const versions = facets.versions.filter(version => versionMatchesSelection(version, selection));
  function changeOwner(field: 'country' | 'jurisdictionId', value: string) {
    const requested: SearchSelection = { ...selection, [field]: value };
    const next = normalizeSearchSelection(facets, requested, field);
    setSelection(next);
    setAdjusted(next.country !== requested.country || next.jurisdictionId !== requested.jurisdictionId || next.versionId !== requested.versionId);
  }
  return <div className="search-filter-fields">
    <SearchableSelect name="jurisdictionId" missingLabel={t(usability.selectedJurisdiction)} label={t(migrationUi.jurisdiction)} anyLabel={t(usability.anyJurisdiction)}
      options={(facets.jurisdictions ?? []).map(facet => ({ value: facet.id, label: `${facet.name}${facet.historical ? ` · ${t(migrationUi.historical)}` : ''} (${facet.count})` }))}
      value={selection.jurisdictionId} onChange={value => changeOwner('jurisdictionId', value)} />
    <p className="muted">{t(usability.jurisdictionScope)}</p>
    <SearchableSelect name="country" label={t(ui.search.page.country)} anyLabel={t(ui.search.page.anyCountry)}
      options={facets.countries.map(facet => ({ value: facet.code, label: `${facet.countryName || facet.code} (${facet.count})` }))}
      value={selection.country} onChange={value => changeOwner('country', value)} />
    <SearchableSelect key={`${selection.country}:${selection.jurisdictionId}`} name="versionId" missingLabel={t(usability.unlistedVersion)} label={t(ui.search.page.version)} anyLabel={t(ui.search.page.anyVersion)}
      options={versions.map(facet => ({ value: facet.id, label: `${facet.constitutionTitle} · ${facet.label} (${facet.count})` }))}
      value={selection.versionId} onChange={value => setSelection(current => ({ ...current, versionId: value }))} />
    {adjusted ? <p role="status" className="muted"><T value={usability.filtersAdjusted} /></p> : null}
    <div className={["field", fieldStyles.field].join(' ')}><label htmlFor="filter-effectiveDate"><T value={ui.search.page.effectiveDate} /></label>
      <select id="filter-effectiveDate" name="effectiveDate" defaultValue={effectiveDate}>
        <option value=""><T value={ui.search.page.anyDate} /></option>
        {facets.dates.map(facet => <option key={facet.effectiveDate} value={facet.effectiveDate}>{facet.effectiveDate} ({facet.count})</option>)}
      </select>
    </div>
  </div>;
}
