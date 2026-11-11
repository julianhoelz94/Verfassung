import { T } from "../../../components/TranslationProvider";
import { ui } from "../../../../lib/messages";
import { constitutionWorkspaceUi as m } from "../../../../lib/constitution-workspace-messages";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminForbidden } from "../../../components/AdminForbidden";
import { Alert, PageHeader } from "../../../components/ui";
import {
  loadCountriesWithDetails,
  getConstitutionSettings,
  getConstitutionSettingsRevision,
} from "../../../../lib/api";
import { requireAdminPage } from "../../../../lib/admin";
import { toOutlineKindWrite } from "../../../../lib/outline";
import { OutlineEditor } from "../OutlineEditor";
import {
  ConstitutionFacts,
  ConstitutionIdentityLayout,
} from "../ConstitutionIdentity";
import { DocumentLinks } from "../../../editor/documents/DocumentLinks";
import { requireSessionBearer } from "../../../../lib/session";
import { structureUi } from "../../../../lib/structure-workspace";

type AdminOutlinePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    migration?: string;
    documentError?: string;
  }>;
};

export default async function AdminOutlinePage(props: AdminOutlinePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  if (
    !(await requireAdminPage(
      `/admin/constitutions/${encodeURIComponent(params.id)}`,
      searchParams,
    ))
  ) {
    return <AdminForbidden title={ui.forbidden.outline} />;
  }
  const authorization = await requireSessionBearer();
  const { details } = await loadCountriesWithDetails(authorization);
  const match = details
    .flatMap((country) =>
      (country?.constitutions ?? []).map((constitution) => ({
        country,
        constitution,
      })),
    )
    .find((row) => row.constitution.id === params.id);
  if (!match) {
    notFound();
  }
  const settings = await getConstitutionSettings(params.id, authorization);
  const previous = settings.predecessorId
    ? await getConstitutionSettingsRevision(
        params.id,
        settings.predecessorId,
        authorization,
      ).catch(() => null)
    : null;
  const kinds = (match.constitution.contentOutline?.kinds ?? []).map(
    toOutlineKindWrite,
  );
  return (
    <OutlineEditor
      constitutionId={params.id}
      title={match.constitution.title}
      context={<p>{match.country?.name}</p>}
      identity={
        <ConstitutionIdentityLayout>
          <ConstitutionFacts
            title={m.identity}
            fields={[
              { label: ui.remainingStatus.country, value: match.country?.name },
              {
                label: ui.remainingStatus.title,
                value: match.constitution.title,
              },
            ]}
            technical={<code>{match.constitution.slug}</code>}
          />
          <ConstitutionFacts
            title={m.saved}
            fields={[
              {
                label: m.textVersions,
                value: (match.constitution.versions ?? []).length,
              },
            ]}
            technical={<code>{settings.id}</code>}
          >
            <p className="muted">
              <T value={m.settingsHelp} />
            </p>
          </ConstitutionFacts>
        </ConstitutionIdentityLayout>
      }
      header={
        <PageHeader
          separator={false}
          breadcrumbs={[
            { href: "/admin", label: <T value={ui.nav.admin} /> },
            {
              href: "/admin/constitutions",
              label: <T value={ui.nav.outlines} />,
            },
            { label: match.constitution.title },
          ]}
          title={<T value={m.settings} />}
          meta={match.country?.name}
        />
      }
      notices={
        <>
          {searchParams.saved ? (
            <Alert tone="success">
              <T
                value={
                  ui.admin.constitutions.id.page
                    .settingsSavedHistoricalVersionsRetainTheirStructural
                }
              />
            </Alert>
          ) : null}
          {(match.constitution.versions ?? []).length === 0 ? (
            <Alert tone="info">
              <T value={ui.admin.constitutions.id.page.theStructureIsReady} />{" "}
              <Link href="/admin/import">
                <T
                  value={ui.admin.constitutions.id.page.importTheFirstVersion}
                />
              </Link>{" "}
              <T value={ui.admin.constitutions.id.page.or} />{" "}
              <Link href="/editor">
                <T value={ui.admin.constitutions.id.page.openTheEditor} />
              </Link>
              <T value={ui.admin.constitutions.id.page.toContinue} />
            </Alert>
          ) : null}
          {searchParams.migration ? (
            <Alert tone="error">
              <T
                value={
                  ui.admin.constitutions.id.page
                    .thisChangeRequiresAReviewedSuccessorMigration
                }
              />
            </Alert>
          ) : null}
          {searchParams.error ? (
            <Alert tone="error">
              <T
                value={ui.admin.constitutions.id.page.theOutlineCouldNotBeSaved}
              />
            </Alert>
          ) : null}
          {searchParams.documentError ? (
            <Alert tone="error">
              <T
                value={
                  ui.admin.constitutions.id.page
                    .theDocumentLinkCouldNotBeChanged
                }
              />
            </Alert>
          ) : null}
        </>
      }
      initial={kinds}
      settingsRevisionId={settings.id}
      previous={
        previous
          ? {
              id: previous.id,
              kinds: previous.outline.kinds.map(toOutlineKindWrite),
            }
          : undefined
      }
      documents={
        <DocumentLinks
          targetType="constitution"
          targetId={params.id}
          returnTo={`/admin/constitutions/${params.id}`}
          canEdit
        />
      }
      history={
        settings.predecessorId && !previous ? (
          <Alert tone="error">
            <T value={structureUi.historyUnavailable} />
          </Alert>
        ) : undefined
      }
    />
  );
}
