import { loginHref } from '../../../../lib/return-to';
import { SignedInSummary } from '../../../components/SignedInSummary';
import { T } from '../../../components/TranslationProvider';
import { ui } from '../../../../lib/messages';
import { message } from '../../../../lib/messages';
import { currentLocale } from '../../../../lib/server-locale';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { WorkspacePage } from '../../../components/layout/templates';
import { Alert, PageHeader } from '../../../components/ui';
import { getCountry, getVersion, listAllArticles, listAllUnits, listConstitutionVersions, listCountries, type ArticleSummary, type VersionSummary } from '../../../../lib/api';
import { amendmentErrorMessage, getAmendment, getAmendmentDiffReview, listRevisions } from '../../../../lib/amendment-editor-api';
import { canVisitEditor } from '../../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../../lib/session';
import { AmendmentEditorLayout } from '../AmendmentEditorLayout';
import { AmendmentForm } from '../AmendmentForm';
import { QuoteReviewPanel } from '../QuoteReviewPanel';
import { DocumentLinks } from '../../documents/DocumentLinks';

type AmendmentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    constitutionId?: string;
    saved?: string;
    published?: string;
    withdrawn?: string;
    error?: string;
    confirmed?: string;
    documentError?: string;
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

async function loadContentByVersion(versions: VersionSummary[]): Promise<{ articlesByVersion: Record<string, string[]>; unitTreesByVersion: Record<string, ArticleSummary[]> }> {
  const entries = await Promise.all(
    versions.map(async (version) => {
      try {
        const articles = await listAllUnits(version.id, true);
        return [version.id, articles] as const;
      } catch {
        return [version.id, [] as ArticleSummary[]] as const;
      }
    }),
  );
  const content = Object.fromEntries(entries);
  return {
    articlesByVersion: Object.fromEntries(Object.entries(content).map(([versionId, articles]) => [versionId, articles.map((article) => article.articleNumber)])),
    unitTreesByVersion: content,
  };
}

export default async function AmendmentDetailPage(props: AmendmentDetailPageProps) {
  const locale = await currentLocale();
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect(loginHref(`/editor/amendments/${encodeURIComponent(id)}`, searchParams));
  }
  if (!canVisitEditor(user.roles)) {
    return (
      <WorkspacePage width="content" header={<PageHeader title={<T value={ui.attrs.editorAmendmentsIdPagePageHeaderTitle} />} meta={<SignedInSummary email={user.email} noEditorialRole />} />}>

      </WorkspacePage>
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
      <WorkspacePage width="content" header={<PageHeader title={<T value={ui.attrs.editorAmendmentsIdPagePageHeaderTitle2} />} />}>

        <Alert tone="error"><T value={ui.editor.amendments.id.page.noConstitutionIsAvailableForThisForm} /></Alert>
      </WorkspacePage>
    );
  }

  const versions =
    sessionToken
      ? (await listConstitutionVersions(constitutionId, {
          listing: 'all',
          authorization: `Bearer ${sessionToken}`,
        })) ?? []
      : [];
  const { articlesByVersion, unitTreesByVersion } = await loadContentByVersion(versions);
  const contentAvailable = Object.values(articlesByVersion).some((articles) => articles.length > 0);
  const latestVersionId = versions.find((version) => version.latestPublished)?.id ?? versions.at(-1)?.id ?? null;

  const revisions = !isNew && sessionToken ? await listRevisions(id) : null;
  const tipRevision = revisions?.at(-1);
  const hasDraftTip = amendment?.status === 'draft' || Boolean(tipRevision && tipRevision.id !== amendment?.publishedRevisionId);
  const pairToReview = !isNew && hasDraftTip && amendment?.sourceVersionId && amendment.targetVersionId;
  const pairDetails = pairToReview ? await Promise.all([
    getVersion(amendment.sourceVersionId!, `Bearer ${sessionToken}`),
    getVersion(amendment.targetVersionId!, `Bearer ${sessionToken}`),
  ]) : null;
  const pairPublished = pairDetails?.every((version) => version?.publicationStatus === 'published') ?? false;
  const diffReview = pairToReview && pairPublished ? await getAmendmentDiffReview(id) : null;
  const diffReviewUnavailable = pairToReview && !pairPublished;
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

  const errorMessage = amendmentErrorMessage(searchParams.error, locale);
  const title = isNew ? message(locale, ui.remainingStatus.newAmendingLaw) : (amendment?.title ?? message(locale, ui.remainingStatus.amendingLaw));

  return (
    <WorkspacePage width="content" header={<PageHeader
          breadcrumbs={[
          { href: '/editor/amendments', label: <T value={ui.nav.legalChanges} /> },
          { label: isNew ? <T value={ui.remainingStatus.new} /> : amendment?.title ?? id.slice(0, 8) },
        ]}
        title={title}
        meta={<SignedInSummary email={user.email} roles={user.roles} />}
      />}>

      {amendment?.reviewStatus === 'needs_review' ? <Alert tone="info"><T value={ui.editor.amendments.id.page.needsReviewQuotesOrDocumentPinsAre} /></Alert> : null}
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.documentError ? <Alert tone="error"><T value={ui.editor.amendments.id.page.theDocumentLinkCouldNotBeChanged} /></Alert> : null}
      {searchParams.saved ? <Alert tone="success"><T value={ui.editor.amendments.id.page.draftSaved} /></Alert> : null}
      {searchParams.published ? <Alert tone="success"><T value={ui.editor.amendments.id.page.amendingLawPublished} /></Alert> : null}
      {searchParams.confirmed ? <Alert tone="success"><T value={ui.editor.amendments.id.page.quotesConfirmedAndTheLegalChangeRepublished} /></Alert> : null}
      {searchParams.withdrawn ? <Alert tone="success"><T value={ui.editor.amendments.id.page.amendingLawWithdrawn} /></Alert> : null}
      {diffReviewUnavailable ? <Alert tone="info"><T value={ui.editor.amendments.id.page.differenceReviewRequiresTwoPublishedSnapshotsPublish} /></Alert> : null}
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
          unitTreesByVersion={unitTreesByVersion}
          latestVersionId={latestVersionId}
          canSave={canSave}
          canWithdraw={false}
          readOnly={readOnly}
          contentAvailable={contentAvailable}
          diffReview={diffReview}
          canReviewDiff={canEdit || hasRole(user.roles, 'reviewer') || canPublish}
          canAcknowledgeDiff={hasRole(user.roles, 'reviewer') || canPublish}
        />
      ) : (
        <AmendmentEditorLayout
          amendmentId={id}
          constitutionId={constitutionId}
          amendment={amendment}
          revisions={revisions}
          versions={versions}
          articlesByVersion={articlesByVersion}
          unitTreesByVersion={unitTreesByVersion}
          latestVersionId={latestVersionId}
          canSave={canSave}
          canPublish={canPublishLaw}
          canWithdraw={canWithdraw}
          readOnly={readOnly}
          canRestore={canRestore}
          contentAvailable={contentAvailable}
          diffReview={diffReview}
          canReviewDiff={canEdit || hasRole(user.roles, 'reviewer') || canPublish}
          canAcknowledgeDiff={hasRole(user.roles, 'reviewer') || canPublish}
        />
      )}
      {!isNew && tipRevision ? <DocumentLinks targetType="amendment" targetId={id} scopeRevisionId={tipRevision.id} returnTo={`/editor/amendments/${id}`} canEdit={canEdit && amendment?.status !== 'withdrawn' && tipRevision.id !== amendment?.publishedRevisionId} /> : null}
    </WorkspacePage>
  );
}
