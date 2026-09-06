import { redirect } from 'next/navigation';
import { Alert, Card, Input } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { ApiUnavailableError, getCountry, listCountries, type CountrySummary } from '../../../lib/api';
import { canVisitAdmin } from '../../../lib/nav';
import { DEFAULT_NEW_OUTLINE } from '../../../lib/outline';
import { currentUser } from '../../../lib/session';
import { createConstitutionAction } from './actions';
import { ConstitutionCountryFields } from './ConstitutionCountryFields';
import { OutlineEditor } from './OutlineEditor';

type AdminConstitutionsPageProps = {
  searchParams: { error?: string };
};

export default async function AdminConstitutionsPage({ searchParams }: AdminConstitutionsPageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitAdmin(user.roles)) {
    return (
      <PageMain>
        <h1>Outlines</h1>
        <Alert tone="error">Administrator role required.</Alert>
      </PageMain>
    );
  }
  let countries: CountrySummary[] = [];
  try {
    countries = (await listCountries()) ?? [];
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) {
      throw error;
    }
  }
  const details = await Promise.all(countries.map((country) => getCountry(country.isoCode).catch(() => null)));
  return (
    <PageMain>
      <h1>Constitution outlines</h1>
      <p className="lede">
        Each constitution has an ordered tree of layers (for example Article → Paragraph → Sentence). The public
        reader uses these labels and presentation rules. Removing a layer later merges that text into the parent layer.
      </p>
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error">Administrator role required.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">That outline change could not be saved.</Alert>
      ) : null}
      <Card>
        <h2>New constitution</h2>
        <p>
          Choose an existing country or add a new one in this form. Then set the tree: the constitution is the parent,
          then each layer below it (article, paragraph, sentence, or whatever this document uses). Concatenated layers
          have no heading and are joined in the reader.
        </p>
        <OutlineEditor action={createConstitutionAction} initial={DEFAULT_NEW_OUTLINE} submitLabel="Create">
          <ConstitutionCountryFields countries={countries} />
          <Input label="Slug" name="slug" required placeholder="basic-law" />
          <Input label="Title" name="title" required />
        </OutlineEditor>
      </Card>
      {details.map((country) =>
        country ? (
          <section key={country.id}>
            <h2>{country.name}</h2>
            <ul className="search-hits">
              {country.constitutions.map((constitution) => (
                <li key={constitution.id} className="card">
                  <p>
                    <a href={`/admin/constitutions/${constitution.id}`}>{constitution.title}</a>
                  </p>
                  <p className="muted">
                    {(constitution.contentOutline?.kinds ?? []).map((kind) => kind.displayLabel).join(' → ') ||
                      'No layers'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </PageMain>
  );
}
