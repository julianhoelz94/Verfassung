'use client';

import { useState } from 'react';
import type { CountryDetail, CountrySummary } from '../../../lib/api';
import { Input } from '../../components/ui';
import { SettingInfo } from '../../components/SettingInfo';
import { ConstitutionCountryFields } from './ConstitutionCountryFields';

function slugify(value: string): string {
  return value.normalize('NFKD').trim().toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function ConstitutionBasicsFields({ countries, details }: { countries: CountrySummary[]; details: CountryDetail[] }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [editedSlug, setEditedSlug] = useState(false);
  const [showSlug, setShowSlug] = useState(false);
  const [countryCode, setCountryCode] = useState(countries[0]?.isoCode ?? '');
  const predecessors = details.find((country) => country.isoCode === countryCode)?.constitutions ?? [];
  const slugField = <>
    <Input label="Catalog slug" info={{ description: 'A readable catalog identifier generated from the title. You can adjust it before creation.', changeability: 'later', changeNote: 'Can be changed later. The old slug remains an alias for catalog lookups.' }} name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => { setEditedSlug(true); setSlug(slugify(event.target.value)); }} />
    {showSlug && !slug ? <p role="alert">Enter a catalog slug using Latin letters and numbers to continue.</p> : null}
    <p className="muted">The catalog uses this slug to identify the constitution.</p>
  </>;
  return <section className="creation-basics" aria-label="Constitution basics">
    <h2>Basics</h2>
    <p>Choose the country and give the constitution its public name. A catalog slug is generated from the title.</p>
    <ConstitutionCountryFields countries={countries} onCountryChange={setCountryCode} />
    {predecessors.length > 0 ? (
      <div className="field">
        <div className="field-label-row"><label htmlFor="predecessor-constitution">Previous constitution</label><SettingInfo label="Previous constitution" description="Connect this constitution to the earlier constitution it replaces. The timeline uses this relationship." changeability="once" /></div>
        <select id="predecessor-constitution" key={countryCode} name="predecessorConstitutionId" defaultValue="">
          <option value="">No predecessor recorded</option>
          {predecessors.map((constitution) => (
            <option key={constitution.id} value={constitution.id}>{constitution.title}</option>
          ))}
        </select>
      </div>
    ) : null}
    <div className="setting-inline"><label><input type="checkbox" name="interim" /> Interim constitution</label><SettingInfo label="Interim constitution" description="Mark a temporary or transitional constitution. This label does not set an end date or change its legal status; record those as lifecycle events." changeability="once" /></div>
    <Input label="Constitution title" info={{ description: 'The public name of this distinct constitution, shown on country pages and timelines.', changeability: 'later' }} name="title" required value={title} onChange={(event) => {
      const next = event.target.value;
      setTitle(next);
      if (!editedSlug) {
        const generated = slugify(next);
        setSlug(generated);
        if (next.trim() && !generated) setShowSlug(true);
      }
    }} />
    {showSlug ? <div className="creation-advanced" role="group" aria-label="Catalog slug"><h3>Catalog slug</h3>{slugField}</div>
      : <details className="creation-advanced"><summary>Advanced · catalog slug</summary>{slugField}</details>}
  </section>;
}
