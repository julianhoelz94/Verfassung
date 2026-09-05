'use client';

import { useState } from 'react';
import { Input, Select } from '../../components/ui';
import type { CountrySummary } from '../../../lib/api';

const NEW_COUNTRY = '__new__';

export function ConstitutionCountryFields({ countries }: { countries: CountrySummary[] }) {
  const [choice, setChoice] = useState(countries[0]?.isoCode ?? NEW_COUNTRY);
  const [isoCode, setIsoCode] = useState('');
  const isNew = choice === NEW_COUNTRY;

  return (
    <>
      <Select
        label="Country"
        name="countryChoice"
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
      >
        {countries.map((country) => (
          <option key={country.id} value={country.isoCode}>
            {country.name} ({country.isoCode})
          </option>
        ))}
        <option value={NEW_COUNTRY}>New country</option>
      </Select>
      {isNew ? (
        <>
          <Input
            label="Country code"
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
          <Input label="Country name" name="countryName" required autoComplete="off" placeholder="France" />
        </>
      ) : (
        <input type="hidden" name="isoCode" value={choice} />
      )}
    </>
  );
}
