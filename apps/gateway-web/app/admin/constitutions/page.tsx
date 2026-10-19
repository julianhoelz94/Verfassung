import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Card, DataList, DataRow, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { loadCountriesWithDetails, type CountryDetail } from '../../../lib/api';
import { requireAdminPage } from '../../../lib/admin';
import { DEFAULT_NEW_OUTLINE } from '../../../lib/outline';
import { createConstitutionAction } from './actions';
import { ConstitutionBasicsFields } from './ConstitutionBasicsFields';
import { OutlineEditor } from './OutlineEditor';
import { requireSessionBearer } from '../../../lib/session';

type AdminConstitutionsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminConstitutionsPage(props: AdminConstitutionsPageProps) {
  const searchParams = await props.searchParams;
  if (!(await requireAdminPage())) {
    return <AdminForbidden title={ui.forbidden.outlines} />;
  }
  const { countries, details } = await loadCountriesWithDetails(await requireSessionBearer());
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
        title={<T value={ui.attrs.adminConstitutionsPagePageHeaderTitleConstitutions} />}
        meta={<T value={ui.attrs.adminConstitutionsPagePageHeaderMetaCreate} />}
      />
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error"><T value={ui.admin.constitutions.page.administratorRoleRequired} /></Alert>
      ) : searchParams.error ? (
        <Alert tone="error"><T value={ui.admin.constitutions.page.thatOutlineChangeCouldNotBeSaved} /></Alert>
      ) : null}
      <Card>
        <h2 className="card-title"><T value={ui.admin.constitutions.page.newConstitution} /></h2>
        <OutlineEditor action={createConstitutionAction} initial={DEFAULT_NEW_OUTLINE} guidedCreation>
          <ConstitutionBasicsFields countries={countries} details={details.filter((country): country is CountryDetail => country != null)} />
        </OutlineEditor>
      </Card>
      <DataList columns={3}>
        {rows.map((row) => (
          <DataRow
            key={row.constitution.id}
            cells={[
              { label: <T value={ui.remainingStatus.country} />, value: row.countryName },
              {
                label: <T value={ui.remainingStatus.title} />,
                value: <a href={`/admin/constitutions/${row.constitution.id}`}>{row.constitution.title}</a>,
              },
              {
                label: <T value={ui.remainingStatus.layers} />,
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
