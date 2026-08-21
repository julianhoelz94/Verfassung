import { ApiUnavailableError, getCountry, type CountryDetail } from '../../../lib/api';

type CountryPageProps = {
  params: { code: string };
};

export default async function CountryPage({ params }: CountryPageProps) {
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
    country = null;
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p>{error}.</p>
      </main>
    );
  }

  if (!country) {
    return (
      <main style={{ padding: 24 }}>
        <p>Unknown country.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 800 }}>
      <p>
        <a href="/">Countries</a>
      </p>
      <h1>{country.name}</h1>
      {country.constitutions.map((constitution) => (
        <section key={constitution.id}>
          <h2>{constitution.title}</h2>
          <ul>
            {constitution.versions.map((version) => (
              <li key={version.id}>
                <a href={`/countries/${country.isoCode}/versions/${version.id}`}>
                  {version.versionLabel}
                  {version.effectiveDate ? ` (${version.effectiveDate})` : ''}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
