import { T } from "../../components/TranslationProvider";
import { ui } from "../../../lib/messages";
import { constitutionWorkspaceUi as m } from "../../../lib/constitution-workspace-messages";
import { AdminForbidden } from "../../components/AdminForbidden";
import { Alert, DataList, DataRow, PageHeader } from "../../components/ui";
import { loadCountriesWithDetails, type CountryDetail } from "../../../lib/api";
import { requireAdminPage } from "../../../lib/admin";
import { DEFAULT_NEW_OUTLINE } from "../../../lib/outline";
import { createConstitutionAction } from "./actions";
import { ConstitutionBasicsFields } from "./ConstitutionBasicsFields";
import { OutlineEditor } from "./OutlineEditor";
import { requireSessionBearer } from "../../../lib/session";

type AdminConstitutionsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminConstitutionsPage(
  props: AdminConstitutionsPageProps,
) {
  const searchParams = await props.searchParams;
  if (!(await requireAdminPage("/admin/constitutions", searchParams))) {
    return <AdminForbidden title={ui.forbidden.outlines} />;
  }
  const { countries, details } = await loadCountriesWithDetails(
    await requireSessionBearer(),
  );
  const rows = details.flatMap((country) =>
    country
      ? country.constitutions.map((constitution) => ({
          countryName: country.name,
          constitution,
        }))
      : [],
  );
  return (
    <OutlineEditor
      action={createConstitutionAction}
      initial={DEFAULT_NEW_OUTLINE}
      guidedCreation
      header={
        <PageHeader
          separator={false}
          title={<T value={m.create} />}
          meta={
            <T value={ui.attrs.adminConstitutionsPagePageHeaderMetaCreate} />
          }
        />
      }
      notices={
        <>
          {searchParams.error === "forbidden" ? (
            <Alert tone="error">
              <T
                value={ui.admin.constitutions.page.administratorRoleRequired}
              />
            </Alert>
          ) : searchParams.error ? (
            <Alert tone="error">
              <T
                value={
                  ui.admin.constitutions.page.thatOutlineChangeCouldNotBeSaved
                }
              />
            </Alert>
          ) : null}
        </>
      }
      existing={
        <DataList columns={3}>
          {rows.map((row) => (
            <DataRow
              key={row.constitution.id}
              cells={[
                {
                  label: <T value={ui.remainingStatus.country} />,
                  value: row.countryName,
                },
                {
                  label: <T value={ui.remainingStatus.title} />,
                  value: (
                    <a href={`/admin/constitutions/${row.constitution.id}`}>
                      {row.constitution.title}
                    </a>
                  ),
                },
                {
                  label: <T value={ui.remainingStatus.layers} />,
                  value:
                    (row.constitution.contentOutline?.kinds ?? [])
                      .map((kind) => kind.displayLabel)
                      .join(" → ") || "No layers",
                },
              ]}
            />
          ))}
        </DataList>
      }
    >
      <ConstitutionBasicsFields
        countries={countries}
        details={details.filter(
          (country): country is CountryDetail => country != null,
        )}
      />
    </OutlineEditor>
  );
}
