import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Card, DataList, DataRow, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { loadCountriesWithDetails } from '../../../lib/api';
import { requireAdminPage } from '../../../lib/admin';
import { DEFAULT_NEW_OUTLINE } from '../../../lib/outline';
import { createConstitutionAction } from './actions';
import { ConstitutionCountryFields } from './ConstitutionCountryFields';
import { OutlineEditor } from './OutlineEditor';

type AdminConstitutionsPageProps = {
  searchParams: { error?: string };
};

export default async function AdminConstitutionsPage({ searchParams }: AdminConstitutionsPageProps) {
  if (!(await requireAdminPage())) {
    return <AdminForbidden title="Outlines" />;
  }
  const { countries, details } = await loadCountriesWithDetails();
  const rows = details.flatMap((country) =>
    country
      ? country.constitutions.map((constitution) => ({
          countryName: country.name,
          constitution,
        }))
      : [],
  );
  return (
    <PageMain className="wide">
      <PageHeader
        title="Constitution outlines"
        meta="Each constitution has an ordered tree of layers. The public reader uses these labels and presentation rules."
      />
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error">Administrator role required.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">That outline change could not be saved.</Alert>
      ) : null}
      <Card>
        <h2 className="card-title">New constitution</h2>
        <p>
          Choose an existing country or add a new one in this form. Then set the tree: the constitution is the parent,
          then each layer below it. Concatenated layers have no heading and are joined in the reader.
        </p>
        <OutlineEditor action={createConstitutionAction} initial={DEFAULT_NEW_OUTLINE} submitLabel="Create">
          <ConstitutionCountryFields countries={countries} />
          <Input label="Slug" name="slug" required placeholder="basic-law" />
          <Input label="Title" name="title" required />
        </OutlineEditor>
      </Card>
      <DataList columns={3}>
        {rows.map((row) => (
          <DataRow
            key={row.constitution.id}
            cells={[
              { label: 'Country', value: row.countryName },
              {
                label: 'Title',
                value: <a href={`/admin/constitutions/${row.constitution.id}`}>{row.constitution.title}</a>,
              },
              {
                label: 'Layers',
                value:
                  (row.constitution.contentOutline?.kinds ?? []).map((kind) => kind.displayLabel).join(' → ') ||
                  'No layers',
              },
            ]}
          />
        ))}
      </DataList>
    </PageMain>
  );
}
