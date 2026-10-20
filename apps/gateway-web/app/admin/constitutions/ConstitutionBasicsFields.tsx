'use client';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { useState } from 'react';
import type { CountryDetail, CountrySummary } from '../../../lib/api';
import { Input } from '../../components/ui';
import { SettingInfo } from '../../components/SettingInfo';
import { ConstitutionCountryFields } from './ConstitutionCountryFields';
import fieldStyles from '../../components/fields.module.css';

function slugify(value: string): string {
  return value.normalize('NFKD').trim().toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function ConstitutionBasicsFields({ countries, details }: { countries: CountrySummary[]; details: CountryDetail[] }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const t = useTranslation();
  const [editedSlug, setEditedSlug] = useState(false);
  const [showSlug, setShowSlug] = useState(false);
  const [countryCode, setCountryCode] = useState(countries[0]?.isoCode ?? '');
  const predecessors = details.find((country) => country.isoCode === countryCode)?.constitutions ?? [];
  const slugField = <>
    <Input label={<T value={ui.attrs.adminConstitutionsConstitutionbasicsfieldsInputLabelCatalog} />} info={{ description: <T value={ui.help.catalogSlugHelp} />, changeability: 'later', changeNote: <T value={ui.help.catalogSlugChange} /> }} name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => { setEditedSlug(true); setSlug(slugify(event.target.value)); }} />
    {showSlug && !slug ? <p role="alert"><T value={ui.admin.constitutions.constitutionbasicsfields.enterACatalogSlugUsingLatinLetters} /></p> : null}
    <p className="muted"><T value={ui.admin.constitutions.constitutionbasicsfields.theCatalogUsesThisSlugToIdentify} /></p>
  </>;
  return <section className="creation-basics" aria-label={t(ui.accessibility.constitutionBasics)}>
    <h2><T value={ui.admin.constitutions.constitutionbasicsfields.basics} /></h2>
    <p><T value={ui.admin.constitutions.constitutionbasicsfields.chooseTheCountryAndGiveTheConstitution} /></p>
    <ConstitutionCountryFields countries={countries} onCountryChange={setCountryCode} />
    {predecessors.length > 0 ? (
      <div className={["field", fieldStyles.field].join(' ')}>
        <div className={["field-label-row", fieldStyles.labelRow].join(' ')}><label htmlFor="predecessor-constitution"><T value={ui.admin.constitutions.constitutionbasicsfields.previousConstitution} /></label><SettingInfo label={<T value={ui.admin.constitutions.constitutionbasicsfields.previousConstitution} />} description={<T value={ui.help.previousConstitutionHelp} />} changeability="once" /></div>
        <select id="predecessor-constitution" key={countryCode} name="predecessorConstitutionId" defaultValue="">
          <option value=""><T value={ui.admin.constitutions.constitutionbasicsfields.noPredecessorRecorded} /></option>
          {predecessors.map((constitution) => (
            <option key={constitution.id} value={constitution.id}>{constitution.title}</option>
          ))}
        </select>
      </div>
    ) : null}
    <div className="setting-inline"><label><input type="checkbox" name="interim" /> <T value={ui.admin.constitutions.constitutionbasicsfields.interimConstitution} /></label><SettingInfo label={<T value={ui.admin.constitutions.constitutionbasicsfields.interimConstitution} />} description={<T value={ui.help.interimConstitutionHelp} />} changeability="once" /></div>
    <Input label={<T value={ui.attrs.adminConstitutionsConstitutionbasicsfieldsInputLabelConstitution} />} info={{ description: <T value={ui.help.constitutionTitleHelp} />, changeability: 'later' }} name="title" required value={title} onChange={(event) => {
      const next = event.target.value;
      setTitle(next);
      if (!editedSlug) {
        const generated = slugify(next);
        setSlug(generated);
        if (next.trim() && !generated) setShowSlug(true);
      }
    }} />
    {showSlug ? <div className="creation-advanced" role="group" aria-label={t(ui.accessibility.catalogSlug)}><h3><T value={ui.admin.constitutions.constitutionbasicsfields.catalogSlug} /></h3>{slugField}</div>
      : <details className="creation-advanced"><summary><T value={ui.admin.constitutions.constitutionbasicsfields.advancedCatalogSlug} /></summary>{slugField}</details>}
  </section>;
}
