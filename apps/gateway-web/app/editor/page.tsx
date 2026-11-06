import { SignedInSummary } from '../components/SignedInSummary';
import { currentLocale } from '../../lib/server-locale';
import { ui } from '../../lib/messages';
import { T } from '../components/TranslationProvider';
import { redirect } from 'next/navigation';
import { WorkspacePage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { getVersion } from '../../lib/api';
import { editorErrorMessage, getDraftPreview } from '../../lib/editor-api';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { EditorLanding } from './EditorLanding';
import { ImportReview } from './ImportReview';
import { loginHref } from '../../lib/return-to';
import { SourceEvidenceWorkspace } from './SourceEvidenceWorkspace';
import { DocumentLinks } from './documents/DocumentLinks';
import {
  loadEditorSession,
  type EditorSearchParams,
} from './editor-page-state';
import { EditorSessionView } from './EditorSessionView';
type EditorPageProps = {
  searchParams: Promise<EditorSearchParams>;
};
/** Editorial roles include administrator capabilities without changing the route's role gate. */
function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role) || roles.includes('admin');
}
/** Authorizes once, resolves the requested workspace and loads the selected persisted session. */
export default async function EditorPage(props: EditorPageProps) {
  const locale = await currentLocale();
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect(loginHref('/editor', searchParams));
  }
  const canEdit = hasRole(user.roles, 'editor');
  const canReview = hasRole(user.roles, 'reviewer');
  const canPublish = hasRole(user.roles, 'publisher');
  if (!canEdit && !canReview && !canPublish) {
    return (
      <WorkspacePage
        width="reading"
        header={
          <PageHeader
            title={<T value={ui.attrs.editorPagePageHeaderTitleEditor} />}
            meta={<SignedInSummary email={user.email} noEditorialRole />}
          />
        }
      ></WorkspacePage>
    );
  }
  if (searchParams.importJobId) {
    return (
      <ImportReview
        jobId={searchParams.importJobId}
        error={searchParams.error}
      />
    );
  }
  const preview = searchParams.sessionId
    ? await getDraftPreview(searchParams.sessionId)
    : null;
  const session = preview?.session;
  if (!session) {
    return (
      <EditorLanding
        userId={user.id}
        email={user.email}
        roles={user.roles}
        status={searchParams.status}
        workStatus={searchParams.workStatus}
        archived={searchParams.archived === 'true'}
        error={searchParams.error}
      />
    );
  }
  if (
    searchParams.scope === 'sources' ||
    (preview.sourceEvidenceRevisions?.length && searchParams.scope !== 'text')
  ) {
    const source = await getVersion(
      session.versionId,
      await requireSessionBearer(),
    );
    const href = (id: string) =>
      source?.countryCode
        ? `/countries/${encodeURIComponent(source.countryCode)}/versions/${encodeURIComponent(id)}`
        : source?.jurisdictionId
          ? `/jurisdictions/${encodeURIComponent(source.jurisdictionId)}/versions/${encodeURIComponent(id)}`
          : undefined;
    return (
      <SourceEvidenceWorkspace
        preview={preview}
        publishedEvidence={source?.sourceEvidence ?? null}
        userId={user.id}
        roles={user.roles}
        documentsPanel={<DocumentLinks targetType="version" targetId={session.versionId}
          returnTo={`/editor?sessionId=${encodeURIComponent(session.id)}&scope=sources`}
          canEdit={canEdit && session.status === 'open' && session.actorId === user.id}
          heading={locale === 'de' ? 'Quellen dieser Textversion' : 'Sources for this text version'} />}
        sourceHref={href(session.versionId)}
        publishedHref={
          preview.newVersionId ? href(preview.newVersionId) : undefined
        }
        error={editorErrorMessage(searchParams.error, locale)}
      />
    );
  }
  const state = await loadEditorSession(preview, user, searchParams, locale, {
    canEdit,
    canReview,
    canPublish,
  });
  return <EditorSessionView state={state} />;
}
