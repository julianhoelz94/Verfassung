'use client';

import { useState } from 'react';
import type { CountryDetail, CountrySummary } from '../../../lib/api';
import { Input } from '../../components/ui';
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
    <Input label="Slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => { setEditedSlug(true); setSlug(slugify(event.target.value)); }} />
    {showSlug && !slug ? <p role="alert">Enter a web address using Latin letters and numbers to continue.</p> : null}
    <p className="muted">The slug is used in the constitution’s public URL.</p>
  </>;
  return <section className="creation-basics" aria-label="Constitution basics">
    <h2>Basics</h2>
    <p>Choose the country and give the constitution its public name. The web address is generated from the title.</p>
    <ConstitutionCountryFields countries={countries} onCountryChange={setCountryCode} />
    {predecessors.length > 0 ? (
      <label>
        Previous constitution, if this replaces one
        <select key={countryCode} name="predecessorConstitutionId" defaultValue="">
          <option value="">No predecessor recorded</option>
          {predecessors.map((constitution) => (
            <option key={constitution.id} value={constitution.id}>{constitution.title}</option>
          ))}
        </select>
      </label>
    ) : null}
    <label><input type="checkbox" name="interim" /> Interim constitution</label>
    <Input label="Constitution title" name="title" required value={title} onChange={(event) => {
      const next = event.target.value;
      setTitle(next);
      if (!editedSlug) {
        const generated = slugify(next);
        setSlug(generated);
        if (next.trim() && !generated) setShowSlug(true);
      }
    }} />
    {showSlug ? <div className="creation-advanced" role="group" aria-label="Web address"><h3>Web address</h3>{slugField}</div>
      : <details className="creation-advanced"><summary>Advanced · web address</summary>{slugField}</details>}
  </section>;
}
