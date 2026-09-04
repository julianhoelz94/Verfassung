import { ApiUnavailableError, listCountries, type CountrySummary } from '../lib/api';

export default async function Page() {
  let countries: CountrySummary[] = [];
  let error: string | null = null;
  try {
    countries = (await listCountries()) ?? [];
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
    countries = [];
  }

  return (
    <main>
      <h1>Countries</h1>
      <p className="lede">
        Read official constitutional texts by country and version, follow amendment history, and compare how the text changed.
      </p>
      {error ? <p>{error}.</p> : null}
      {!error && countries.length === 0 ? <p>No countries are published yet.</p> : null}
      <ul>
        {countries.map((country) => (
          <li key={country.id}>
            <a href={`/countries/${country.isoCode}`}>{country.name}</a>
            {' '}
            <span className="muted">({country.isoCode})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
