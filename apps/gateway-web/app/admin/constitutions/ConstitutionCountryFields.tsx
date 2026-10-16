'use client';

import { T, ui } from '../../components/TranslationProvider';
import { useState } from 'react';
import { Input, Select } from '../../components/ui';
import type { CountrySummary } from '../../../lib/api';

const NEW_COUNTRY = '__new__';

export function ConstitutionCountryFields({ countries, onCountryChange }: { countries: CountrySummary[]; onCountryChange?: (code: string) => void }) {
  const [choice, setChoice] = useState(countries[0]?.isoCode ?? NEW_COUNTRY);
  const [isoCode, setIsoCode] = useState('');
  const isNew = choice === NEW_COUNTRY;

  return (
    <>
      <Select
        label={<T value={ui.attrs.adminConstitutionsConstitutioncountryfieldsSelectLabelCountry} />}
        info={{ description: 'Choose the country that this constitution belongs to, or create a new country.', changeability: 'once' }}
        name="countryChoice"
        value={choice}
        onChange={(event) => { setChoice(event.target.value); onCountryChange?.(event.target.value); }}
      >
        {countries.map((country) => (
          <option key={country.id} value={country.isoCode}>
            {country.name} ({country.isoCode})
          </option>
        ))}
        <option value={NEW_COUNTRY}><T value={ui.admin.constitutions.constitutioncountryfields.newCountry} /></option>
      </Select>
      {isNew ? (
        <>
          <Input
            label={<T value={ui.attrs.adminConstitutionsConstitutioncountryfieldsInputLabelCountry} />}
            info={{ description: 'The two-letter country code used in public links and listings.', changeability: 'once' }}
            name="isoCode"
            required
            maxLength={2}
            minLength={2}
            pattern="[A-Za-z]{2}"
            autoComplete="off"
            spellCheck={false}
            placeholder="FR"
            value={isoCode}
            onChange={(event) => setIsoCode(event.target.value.toUpperCase())}
          />
          <Input label={<T value={ui.attrs.adminConstitutionsConstitutioncountryfieldsInputLabelCountry2} />} info={{ description: 'The public name shown on the country page and in selectors.', changeability: 'once' }} name="countryName" required autoComplete="off" placeholder="France" />
        </>
      ) : (
        <input type="hidden" name="isoCode" value={choice} />
      )}
    </>
  );
}
