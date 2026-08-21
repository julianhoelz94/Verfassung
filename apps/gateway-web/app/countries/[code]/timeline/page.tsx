import {
  ApiUnavailableError,
  getCountry,
  listAmendments,
  type Amendment,
  type CountryDetail,
} from '../../../../lib/api';

type TimelinePageProps = {
  params: { code: string };
};

export default async function TimelinePage({ params }: TimelinePageProps) {
  let country: CountryDetail | null = null;
  let amendments: Amendment[] = [];
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    if (country) {
      const groups = await Promise.all(
        country.constitutions.flatMap((constitution) =>
          constitution.versions.map((version) => listAmendments(version.id)),
        ),
      );
      amendments = groups.flatMap((group) => group ?? []);
    }
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Services are unavailable';
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
        <a href={`/countries/${country.isoCode}`}>{country.name}</a>
      </p>
      <h1>Amendment timeline</h1>
      {amendments.length === 0 ? <p>No recorded amendments for published versions.</p> : null}
      <ol>
        {amendments.map((amendment) => (
          <li key={amendment.id} style={{ marginBottom: 24 }}>
            <h2>{amendment.title}</h2>
            <p>
              {amendment.enactedOn ?? 'Date unknown'}
              {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
            </p>
            <p>{amendment.summary}</p>
            <ul>
              {amendment.changes.map((change) => (
                <li key={change.id}>
                  {change.changeType}
                  {change.articleNumber ? ` Art. ${change.articleNumber}` : ''}
                  {change.note ? `: ${change.note}` : ''}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}
