import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { PageMain } from '../../../components/PageMain';
import { Alert, PageHeader } from '../../../components/ui';
import { getCountry, listAllArticles, listConstitutionVersions, listCountries, type VersionSummary } from '../../../../lib/api';
import { amendmentErrorMessage, getAmendment, listRevisions } from '../../../../lib/amendment-editor-api';
import { canVisitEditor } from '../../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../../lib/session';
import { AmendmentEditorLayout } from '../AmendmentEditorLayout';
import { AmendmentForm } from '../AmendmentForm';
import { QuoteReviewPanel } from '../QuoteReviewPanel';

type AmendmentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    constitutionId?: string;
    saved?: string;
    published?: string;
    withdrawn?: string;
    error?: string;
    confirmed?: string;
  }>;
};

function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role) || roles.includes('admin');
}

async function resolveConstitutionId(
  amendmentConstitutionId: string | undefined,
  queryConstitutionId: string | undefined,
): Promise<string | null> {
  if (amendmentConstitutionId) {
    return amendmentConstitutionId;
  }
  if (queryConstitutionId) {
    return queryConstitutionId;
  }
  try {
    const countries = (await listCountries()) ?? [];
    const country = countries[0] ? await getCountry(countries[0].isoCode) : null;
    return country?.constitutions[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function loadArticlesByVersion(versions: VersionSummary[]): Promise<Record<string, string[]>> {
  const entries = await Promise.all(
    versions.map(async (version) => {
      try {
        const articles = await listAllArticles(version.id);
        return [version.id, articles.map((article) => article.articleNumber)] as const;
      } catch {
        return [version.id, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export default async function AmendmentDetailPage(props: AmendmentDetailPageProps) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitEditor(user.roles)) {
    return (
      <PageMain className="wide">
        <PageHeader title="Amending law" meta={`Signed in as ${user.email}, but this account has no editorial role.`} />
      </PageMain>
    );
  }

  const canEdit = hasRole(user.roles, 'editor');
  const canPublish = hasRole(user.roles, 'publisher');
  const readOnly = !canEdit;
  const isNew = id === 'new';

  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const amendment = isNew || !sessionToken ? null : await getAmendment(id);
  if (!isNew && !amendment) {
    notFound();
  }

  const constitutionId = await resolveConstitutionId(amendment?.constitutionId, searchParams.constitutionId);
  if (!constitutionId) {
    return (
      <PageMain className="wide">
        <PageHeader title="Legal change" />
        <Alert tone="error">No constitution is available for this form.</Alert>
      </PageMain>
    );
  }

  const versions =
    sessionToken
      ? (await listConstitutionVersions(constitutionId, {
          listing: 'all',
          authorization: `Bearer ${sessionToken}`,
        })) ?? []
      : [];
  const articlesByVersion = await loadArticlesByVersion(versions);
  const contentAvailable = Object.values(articlesByVersion).some((articles) => articles.length > 0);
  const latestVersionId = versions.find((version) => version.latestPublished)?.id ?? versions.at(-1)?.id ?? null;

  const revisions = !isNew && sessionToken ? await listRevisions(id) : null;
  const publishedRevision = revisions?.find((revision) => revision.id === amendment?.publishedRevisionId) ?? null;
  const quotedVersionIds = publishedRevision
    ? [publishedRevision.sourceVersionId, publishedRevision.targetVersionId].filter((versionId): versionId is string => Boolean(versionId))
    : [];
  const reviewVersionIds = [...new Set(quotedVersionIds.flatMap((versionId) => [versionId, versions.find((version) => version.id === versionId)?.currentVersionId].filter((id): id is string => Boolean(id))))];
  const reviewContentEntries = await Promise.all(reviewVersionIds.map(async (versionId) => {
    const articles = await listAllArticles(versionId, true).catch(() => []);
    return [versionId, articles.map((article) => `Article ${article.articleNumber}: ${article.body ?? article.title}`)] as const;
  }));
  const reviewContentByVersion = Object.fromEntries(reviewContentEntries);

  const canSave = canEdit;
  const canPublishLaw = canPublish && amendment?.status !== 'withdrawn' && !isNew;
  const canWithdraw = canPublish && amendment?.status === 'published';
  const canRestore = canEdit;

  const errorMessage = amendmentErrorMessage(searchParams.error);
  const title = isNew ? 'New amending law' : (amendment?.title ?? 'Amending law');

  return (
    <PageMain className="wide">
      <PageHeader
          breadcrumbs={[
          { href: '/editor/amendments', label: 'Legal changes' },
          { label: isNew ? 'New' : amendment?.title ?? id.slice(0, 8) },
        ]}
        title={title}
        meta={`Signed in as ${user.email}. Roles: ${user.roles.join(', ')}.`}
      />
      {amendment?.reviewStatus === 'needs_review' ? <Alert tone="info">Needs review: quotes or document pins are stale.</Alert> : null}
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? <Alert tone="success">Draft saved.</Alert> : null}
      {searchParams.published ? <Alert tone="success">Amending law published.</Alert> : null}
      {searchParams.confirmed ? <Alert tone="success">Quotes confirmed and the legal change republished.</Alert> : null}
      {searchParams.withdrawn ? <Alert tone="success">Amending law withdrawn.</Alert> : null}
      {amendment?.reviewStatus === 'needs_review' ? (
        <QuoteReviewPanel
          amendment={amendment}
          publishedRevision={publishedRevision}
          versions={versions}
          canConfirm={canPublishLaw}
          contentByVersion={reviewContentByVersion}
        />
      ) : null}
      {isNew || !amendment ? (
        <AmendmentForm
          amendmentId="new"
          constitutionId={constitutionId}
          amendment={amendment}
          versions={versions}
          articlesByVersion={articlesByVersion}
          latestVersionId={latestVersionId}
          canSave={canSave}
          canPublish={false}
          canWithdraw={false}
          readOnly={readOnly}
          contentAvailable={contentAvailable}
        />
      ) : (
        <AmendmentEditorLayout
          amendmentId={id}
          constitutionId={constitutionId}
          amendment={amendment}
          revisions={revisions}
          versions={versions}
          articlesByVersion={articlesByVersion}
          latestVersionId={latestVersionId}
          canSave={canSave}
          canPublish={canPublishLaw}
          canWithdraw={canWithdraw}
          readOnly={readOnly}
          canRestore={canRestore}
          contentAvailable={contentAvailable}
        />
      )}
    </PageMain>
  );
}
