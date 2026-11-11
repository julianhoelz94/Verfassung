import { DocumentLinks } from "../../../../editor/documents/DocumentLinks";
import { loginHref } from "../../../../../lib/return-to";
import { T } from "../../../../components/TranslationProvider";
import { ui } from "../../../../../lib/messages";
import { notFound, redirect } from "next/navigation";
import { AdminForbidden } from "../../../../components/AdminForbidden";
import { PageHeader } from "../../../../components/ui";
import { SetupProposalReview } from "../SetupProposalReview";
import { currentUser, requireSessionBearer } from "../../../../../lib/session";
import { getSetupProposal } from "../../../../../lib/ingestion-api";
import { getJurisdiction } from "../../../../../lib/migration-api";
import {
  ConstitutionFacts,
  ConstitutionIdentityLayout,
} from "../../../constitutions/ConstitutionIdentity";
import { constitutionWorkspaceUi as m } from "../../../../../lib/constitution-workspace-messages";
import { migrationUi } from "../../../../../lib/migration-messages";

type Props = {
  params: Promise<{ proposalId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function SetupProposalPage({
  params,
  searchParams,
}: Props) {
  const { proposalId } = await params;
  const user = await currentUser();
  if (!user)
    redirect(
      loginHref(
        `/admin/import/setup/${encodeURIComponent(proposalId)}`,
        await searchParams,
      ),
    );
  if (!user.roles.some((role) => role === "editor" || role === "admin"))
    return <AdminForbidden title={ui.forbidden.constitutionSetup} />;
  const proposal = await getSetupProposal(
    proposalId,
    await requireSessionBearer(),
  ).catch(() => null);
  if (!proposal) notFound();
  const error = (await searchParams).error;
  const payload = proposal.payload;
  const jurisdiction =
    typeof payload.jurisdictionId === "string"
      ? await getJurisdiction(payload.jurisdictionId)
      : null;
  return (
    <SetupProposalReview
      header={
        <PageHeader
          separator={false}
          title={<T value={ui.setupReview.title} />}
        />
      }
      context={
        <p>
          {String(payload.countryName ?? "")} · {String(payload.isoCode ?? "")}
        </p>
      }
      documents={
        <DocumentLinks
          targetType="setup_proposal"
          targetId={proposalId}
          returnTo={`/admin/import/setup/${proposalId}`}
          canEdit
        />
      }
      proposal={proposal}
      error={error}
      identity={
        <ConstitutionIdentityLayout>
          <ConstitutionFacts
            title={ui.admin.import.setup.proposalid.page.sourceAndIdentity}
            fields={[
              {
                label: ui.remainingStatus.country,
                value: jurisdiction ? (
                  <>
                    <a href={`/jurisdictions/${jurisdiction.jurisdiction.id}`}>
                      {jurisdiction.jurisdiction.name}
                    </a>
                    {jurisdiction.jurisdiction.historical ? (
                      <>
                        {" "}
                        · <T value={migrationUi.historical} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    {String(payload.countryName ?? "")} (
                    {String(payload.isoCode ?? "")})
                  </>
                ),
              },
              {
                label: ui.remainingStatus.title,
                value: String(payload.constitutionTitle ?? ""),
              },
              {
                label: ui.admin.import.setup.proposalid.page.language,
                value: String(payload.languageCode ?? ""),
              },
            ]}
            technical={<code>{String(payload.constitutionSlug ?? "")}</code>}
          />
          <ConstitutionFacts
            title={m.proposalSource}
            fields={[
              {
                label: ui.admin.import.setup.proposalid.page.source,
                value:
                  typeof payload.sourceUrl === "string" &&
                  payload.sourceUrl.startsWith("https://") ? (
                    <a
                      href={payload.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {payload.sourceUrl}
                    </a>
                  ) : (
                    String(payload.sourceUrl || payload.gazetteReference || "—")
                  ),
              },
              ...(payload.sourceUrl && payload.gazetteReference
                ? [
                    {
                      label: ui.admin.import.setup.proposalid.page.source,
                      value: String(payload.gazetteReference),
                    },
                  ]
                : []),
            ]}
          />
        </ConstitutionIdentityLayout>
      }
    />
  );
}
