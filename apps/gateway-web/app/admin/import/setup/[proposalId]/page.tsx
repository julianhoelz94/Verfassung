import { DocumentLinks } from "../../../../editor/documents/DocumentLinks";
import { loginHref } from "../../../../../lib/return-to";
import { T } from "../../../../components/TranslationProvider";
import { ui } from "../../../../../lib/messages";
import { notFound, redirect } from "next/navigation";
import { AdminForbidden } from "../../../../components/AdminForbidden";
import { Card, PageHeader } from "../../../../components/ui";
import { SetupProposalReview } from "../SetupProposalReview";
import { currentUser, requireSessionBearer } from "../../../../../lib/session";
import { getSetupProposal } from "../../../../../lib/ingestion-api";
import { getJurisdiction } from "../../../../../lib/migration-api";
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
        <Card>
          <h2>
            <T
              value={ui.admin.import.setup.proposalid.page.sourceAndIdentity}
            />
          </h2>
          <p>
            {jurisdiction ? (
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
            )}{" "}
            · {String(payload.constitutionTitle ?? "")}
          </p>
          <p>
            <T value={ui.admin.import.setup.proposalid.page.slug} />{" "}
            <code>{String(payload.constitutionSlug ?? "")}</code>{" "}
            <T value={ui.admin.import.setup.proposalid.page.language} />{" "}
            {String(payload.languageCode ?? "")}
          </p>
          <p>
            <T value={ui.admin.import.setup.proposalid.page.source} />{" "}
            {typeof payload.sourceUrl === "string" &&
            payload.sourceUrl.startsWith("https://") ? (
              <a href={payload.sourceUrl} rel="noreferrer" target="_blank">
                {payload.sourceUrl}
              </a>
            ) : (
              String(payload.gazetteReference || "")
            )}
          </p>
        </Card>
      }
    />
  );
}
