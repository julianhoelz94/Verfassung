import { statusMessage } from '../../lib/ui-labels';
import { SignedInSummary } from '../components/SignedInSummary';
import { currentLocale } from '../../lib/server-locale';
import { message } from '../../lib/messages';
import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { redirect } from 'next/navigation';
import { ArticleFilterList } from '../components/ArticleFilterList';
import { ConstitutionText } from '../components/ConstitutionText';
import { WorkspacePage, WorkspaceLayout } from '../components/layout/templates';
import { Alert, Badge, Button, PageHeader, WorkflowSteps } from '../components/ui';
import { getCountry, listAllArticles, getArticle, listAllUnits, getUnit, getVersionSettings, listCountries, type ArticleSummary, type CountryDetail, type CountrySummary } from '../../lib/api';
import { editorErrorMessage, getDraftPreview, getEditorDiffReview, getStructuredDraft } from '../../lib/editor-api';
import { decisionReadyForReview } from '../../lib/diff-review';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { ArticleEditor } from './ArticleEditor';
import { EditorDraftState, SubmitReviewButton } from './EditorDraftState';
import { draftDifferences, nodes, readerNode } from '../../lib/structured-editor';
import { OrderedContentTree } from '../components/ConstitutionText';
import { StructuredEditor } from './StructuredEditor';
import { PublishForm } from './PublishForm';
import { LegacyPublishForm } from './LegacyPublishForm';
import { EditorLanding } from './EditorLanding';
import { ImportReview } from './ImportReview';
import { reviewUi } from '../../lib/ui-review-messages';
import { Stack } from '../components/layout/Layout';
import surfaceStyles from '../components/surfaces.module.css';

type EditorPageProps = {
  searchParams: Promise<{
    country?: string;
    constitutionId?: string;
    scope?: string;
    selectedNode?: string;
    versionId?: string;
    sessionId?: string;
    importJobId?: string;
    articleId?: string;
    saved?: string;
    detailsSaved?: string;
    reviewed?: string;
    approved?: string;
    published?: string;
    amendmentPending?: string;
    newVersionLabel?: string;
    amendmentTitle?: string;
    newVersionId?: string;
    error?: string;
    mine?: string;
    status?: string;
  }>;
};

function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role) || roles.includes('admin');
}

export default async function EditorPage(props: EditorPageProps) {
  const locale = await currentLocale();
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  const canEdit = hasRole(user.roles, 'editor');
  const canReview = hasRole(user.roles, 'reviewer');
  const canPublish = hasRole(user.roles, 'publisher');
  if (!canEdit && !canReview && !canPublish) {
    return (
      <WorkspacePage width="reading" header={<PageHeader title={<T value={ui.attrs.editorPagePageHeaderTitleEditor} />} meta={<SignedInSummary email={user.email} noEditorialRole />} />}>

      </WorkspacePage>
    );
  }

  if (searchParams.importJobId) {
    return <ImportReview jobId={searchParams.importJobId} error={searchParams.error} />;
  }

  const preview = searchParams.sessionId ? await getDraftPreview(searchParams.sessionId) : null;
  const session = preview?.session;
  if (!session) {
    return <EditorLanding userId={user.id} email={user.email} roles={user.roles} status={searchParams.status} error={searchParams.error} />;
  }

  let countries: CountrySummary[] = [];
  try {
    countries = (await listCountries()) ?? [];
  } catch {
    countries = [];
  }
  const countryDetails: CountryDetail[] = (await Promise.all(countries.map((item) => getCountry(item.isoCode))))
    .filter((item): item is CountryDetail => item !== null);
  const versionId = session.versionId;
  const staffAuthorization = await requireSessionBearer();
  const selectedCountry = countryDetails.find((country) => country.constitutions.some((constitution) =>
    constitution.versions.some((version) => version.id === versionId || version.currentVersionId === versionId),
  ));
  const selectedConstitution = selectedCountry?.constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === versionId || version.currentVersionId === versionId),
  );
  const selectedVersion = selectedConstitution?.versions.find((version) => version.id === versionId || version.currentVersionId === versionId);
  const settings = session && versionId ? await getVersionSettings(versionId) : null;
  const displayOutline = settings?.outline ?? selectedConstitution?.contentOutline;
  const kindLabel = (kind?: string) => kind ? displayOutline?.kinds.find((item) => item.kindCode === kind)?.displayLabel ?? kind : message(locale, ui.editorDynamic.unit);
  const units: ArticleSummary[] = versionId ? await listAllUnits(versionId, false, staffAuthorization) : [];
  const legacySource = units.some(unit => unit.legacyIdentity);
  const structured = session && !legacySource && !(preview?.drafts?.length) ? await getStructuredDraft(session.id) : null;
  const diffReview = structured && session?.hopKind === 'legal' && session.status !== 'published'
    ? await getEditorDiffReview(session.id)
    : null;
  const reviewDecisions = new Map(diffReview?.decisions.map((decision) => [decision.key, decision]));
  const reviewComplete = diffReview?.candidates.every((candidate) => decisionReadyForReview(candidate, reviewDecisions.get(candidate.key))) ?? true;
  const sourceArticles: ArticleSummary[] = legacySource && versionId ? await listAllArticles(versionId, false, staffAuthorization) : units;
  const articles: ArticleSummary[] = structured ? structured.roots.map((root, index) => ({
    id: sourceArticles.find(article => article.logicalId === root.logicalId)?.id ?? root.logicalId,
    versionId: versionId!, articleNumber: root.label ?? '', title: root.title ?? '', sortOrder: index + 1,
    kind: root.kind, logicalId: root.logicalId,
  })) : sourceArticles;
  const selectionRoot = searchParams.selectedNode ? structured?.roots.find(root => nodes([root]).some(node => node.logicalId === searchParams.selectedNode || node.content.some(entry => entry.logicalId === searchParams.selectedNode))) : undefined;
  const selectedId = (selectionRoot ? articles.find(article => article.logicalId === selectionRoot.logicalId)?.id : undefined) ?? (articles.some(article => article.id === searchParams.articleId) ? searchParams.articleId : articles[0]?.id);
  const selectedSummary = articles.find(article => article.id === selectedId);
  const selectedRoot = structured?.roots.find(root => root.logicalId === selectedSummary?.logicalId);
  const selected = selectedRoot && selectedSummary ? { ...selectedSummary, body: '', content: selectedRoot.content as import('../../lib/api').OrderedEntry[] } : selectedId && versionId ? legacySource ? await getArticle(selectedId, staffAuthorization) : await getUnit(versionId, selectedId, staffAuthorization) : null;
  const draft = selected ? preview?.drafts?.find(item => item.articleId === selected.id) : undefined;
  const editorReturnTo =
    versionId && searchParams.sessionId && selected
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}&articleId=${encodeURIComponent(selected.id)}`
      : '/editor';
  const articleHrefBase =
    versionId && searchParams.sessionId
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}${searchParams.scope ? `&scope=${encodeURIComponent(searchParams.scope)}` : ''}`
      : '/editor';
  const differences = structured ? draftDifferences(structured.sourceRoots, structured.roots) : [];
  const changedRootIds = structured ? [...structured.sourceRoots, ...structured.roots].filter(root => {
    const identities = nodes([root]).flatMap(node => [node.logicalId, ...node.content.map(entry => entry.logicalId)]);
    return differences.some(change => identities.includes(change.logicalId));
  }).map(root => root.logicalId) : [];
  const draftIds = [...(preview?.drafts ?? []).map((item) => item.articleId), ...articles.filter(article => article.logicalId && changedRootIds.includes(article.logicalId)).map(article => article.id)];
  const changedLabels = articles
    .filter((article) => draftIds.includes(article.id))
    .map((article) => `${kindLabel(article.kind)} ${article.articleNumber}`);
  if (structured) sourceArticles.filter(article => article.logicalId && changedRootIds.includes(article.logicalId) && !articles.some(target => target.logicalId === article.logicalId)).forEach(article => changedLabels.push(`${message(locale, ui.editor.publishform.removed)} ${kindLabel(article.kind)} ${article.articleNumber}`));
  const errorMessage = editorErrorMessage(searchParams.error, locale);
  const alerts = (
    <>
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? <Alert tone="success"><T value={ui.editor.page.draftSaved} /></Alert> : null}
      {searchParams.detailsSaved ? <Alert tone="success"><T value={ui.editor.page.publishDetailsSaved} /></Alert> : null}
      {searchParams.reviewed ? <Alert tone="success"><T value={ui.editor.page.submittedForReview} /></Alert> : null}
      {searchParams.approved ? <Alert tone="success"><T value={ui.editor.page.reviewApprovedAPublisherCanNowPublish} /></Alert> : null}
      {searchParams.published ? (
        <Alert tone="success">
          {searchParams.newVersionLabel
            ? <><T value={ui.editorDynamic.publishedAsVersion} /> {searchParams.newVersionLabel}{searchParams.amendmentTitle ? ` · ${searchParams.amendmentTitle}` : ''}.</>
            : <T value={ui.editorDynamic.publishedNewVersion} />}
        </Alert>
      ) : null}
      {searchParams.amendmentPending ? <Alert tone="error"><T value={ui.editor.page.theSnapshotWasPublishedButTheChange} /></Alert> : null}
    </>
  );

  const title = `${selectedConstitution?.title ?? message(locale, ui.remainingStatus.constitution)} · ${selectedVersion?.versionLabel ?? ''}`.trim();
  const publicHref =
    selectedCountry && versionId ? `/countries/${selectedCountry.isoCode}/versions/${encodeURIComponent(versionId)}` : undefined;
  const canSave = Boolean(canEdit && session.status === 'open' && selected && versionId && searchParams.sessionId);
  const hiddenFields = (
    <>
      <input type="hidden" name="sessionId" value={searchParams.sessionId} />
      <input type="hidden" name="versionId" value={versionId ?? ''} />
      <input type="hidden" name="articleId" value={selectedId ?? ''} />
    </>
  );

  return (
    <WorkspacePage width="content" header={<PageHeader
        breadcrumbs={[{ href: '/editor', label: <T value={ui.nav.editor} /> }, { label: `${message(locale, ui.remainingStatus.session)} ${session.id.slice(0, 8)}` }]}
        eyebrow={`${message(locale, session.hopKind === 'legal' ? ui.remainingStatus.nextLegalChange : ui.remainingStatus.transcriptionCorrection)} · ${message(locale, session.status === 'open' ? ui.workflow.draft : session.status === 'reviewing' ? ui.workflow.inReview : session.status === 'approved' ? ui.workflow.approved : ui.workflow.published)}`}
        title={title || <T value={ui.nav.editor} />}
        meta={<WorkflowSteps status={session.status} />}
        actions={
          publicHref ? (
            <a className="btn btn-ghost" href={publicHref}>
              <T value={ui.editor.page.viewPublicPage} />{" "}</a>
          ) : null
        }
      />}>

      {alerts}
      {searchParams.sessionId && articles.length > 0 ? (
        <EditorDraftState><WorkspaceLayout>
          <aside className={["panel", surfaceStyles.panel].join(' ')} aria-label={message(locale, ui.accessibility.topLevelUnits)}>
            <h2 className="panel-title"><T value={(settings?.outline ?? selectedConstitution?.contentOutline)?.kinds[0]?.kindCode === 'article' ? ui.editorDynamic.articles : ui.editorDynamic.topLevelUnits} /></h2>
            <p className="muted">{draftIds.length} <T value={ui.editor.page.changed} /></p>
            <ArticleFilterList
              articles={articles}
              selectedId={selected?.id}
              hrefBase={articleHrefBase}
              draftIds={draftIds}
              unitLabel={settings?.outline.kinds[0]?.kindCode === 'article' ? undefined : settings?.outline.kinds[0]?.displayLabel}
            />
          </aside>
          <section className={["panel", surfaceStyles.panel].join(' ')} aria-labelledby="edit-title">
            <p className="panel-title" id="edit-title">
              {selected ? `${kindLabel(selected.kind)} ${selected.articleNumber}` : message(locale, ui.editorDynamic.unit)}
            </p>
            {structured && selectedRoot && settings && versionId && selected && selectedConstitution ? <StructuredEditor
              key={`${session.id}:${structured.generation}:${selectedRoot.logicalId}`}
              review={differences.map(difference => { const sourceRoot = structured.sourceRoots.find(root => nodes([root]).some(node => node.logicalId === difference.logicalId || node.content.some(entry => entry.logicalId === difference.logicalId))); const targetRoot = structured.roots.find(root => nodes([root]).some(node => node.logicalId === difference.logicalId || node.content.some(entry => entry.logicalId === difference.logicalId))); const targetOccurrence = targetRoot && preview.unitMapping?.[targetRoot.logicalId]; return { ...difference, sourceLink: sourceRoot?.occurrenceId ? `/versions/${structured.sourceVersionId}/units/${sourceRoot.occurrenceId}` : undefined, targetLink: preview.newVersionId && targetOccurrence ? `/versions/${preview.newVersionId}/units/${targetOccurrence}` : undefined }; })} preview={{ ...structured, roots: structured.roots.map(root => root.logicalId === selectedRoot.logicalId ? root : { ...root, content: [] }), sourceRoots: structured.sourceRoots.map(root => root.logicalId === selectedRoot.logicalId ? root : { ...root, content: [] }) }} outline={settings.outline} rootId={selectedRoot.logicalId} versionId={versionId} articleId={selected.id} constitutionId={selectedConstitution.id} publishedVersionId={preview.newVersionId} unitMapping={preview.unitMapping} editable={canSave && session.actorId === user.id} scope={searchParams.scope} selectedNode={searchParams.selectedNode}
            /> : canSave && selected && versionId && searchParams.sessionId ? (
              <ArticleEditor
                sessionId={searchParams.sessionId}
                versionId={versionId}
                articleId={selected.id}
                title={draft?.title ?? selected.title}
                body={draft?.body ?? selected.body}
              />
            ) : selected ? (
              <ConstitutionText
                article={{
                  articleNumber: selected.articleNumber,
                  title: draft?.title ?? selected.title,
                  body: draft?.body ?? selected.body,
                  children: draft ? undefined : selected.children,
                }}
                headingLevel="h3"
                outline={settings?.outline ?? selectedConstitution?.contentOutline}
                canEditTitles
                returnTo={editorReturnTo}
              />
            ) : null}
            {selected && versionId && searchParams.sessionId && canEdit && session.status === 'open' && !structured && selected.children && selected.children.length > 0 ? (
              <details>
                <summary className="btn btn-sm"><T value={ui.editor.page.sectionTitles} /></summary>
                <p className="muted"><T value={ui.editor.page.nameNestedLayersSuchAsParagraphsTitles} /></p>
                <ConstitutionText
                  nodes={selected.children}
                  showHeading={false}
                  outline={settings?.outline ?? selectedConstitution?.contentOutline}
                  canEditTitles
                  returnTo={editorReturnTo}
                />
              </details>
            ) : null}
            <div className="action-bar">
              {canEdit && session.status === 'open' ? (
                <a className="btn" href="/editor">
                  <T value={reviewUi.returnToSessions} />{" "}</a>
              ) : null}
              {canEdit && session.status === 'open' ? (
                <Stack as="form" action="/editor/command" method="post">
                  <input type="hidden" name="command" value="review" />
                  {hiddenFields}
                  <SubmitReviewButton disabled={session.hopKind === 'legal' ? !preview.changeRecord || Boolean(structured && (!preview.changeRecord.changes?.length || !reviewComplete)) : session.hopKind === 'editorial_correction' ? !preview.publishComment : false} />
                </Stack>
              ) : null}
              {canReview && session.status === 'reviewing' ? (
                <Stack as="form" action="/editor/command" method="post">
                  <input type="hidden" name="command" value="approve" />
                  {hiddenFields}
                  <Button><T value={ui.editor.page.approveReview} /></Button>
                </Stack>
              ) : null}
            </div>
          </section>
          <aside className={["panel panel-side", surfaceStyles.panel].join(' ')} aria-label={message(locale, ui.accessibility.session)}>
            <p className="panel-title"><T value={ui.editor.page.session} /></p>
            <dl className="provenance provenance-list">
              <div>
                <dt><T value={ui.editor.page.status} /></dt>
                <dd>
                  <Badge tone="changed">{<T value={statusMessage(session.status)} />}</Badge>
                </dd>
              </div>
              <div>
                <dt><T value={ui.editor.page.openedBy} /></dt>
                <dd>{session.actorId === user.id ? message(locale, ui.editorDynamic.you) : session.actorId.slice(0, 8)}</dd>
              </div>
              <div>
                <dt><T value={ui.editor.page.changedArticles} /></dt>
                <dd>{changedLabels.length > 0 ? changedLabels.join(', ') : message(locale, ui.editorDynamic.noneYet)}</dd>
              </div>
              <div>
                <dt><T value={ui.editor.page.revisions} /></dt>
                <dd>{session.revisionCount}</dd>
              </div>
              {preview.searchIndexStatus ? (
                <div>
                  <dt><T value={ui.editor.page.searchIndex} /></dt>
                  <dd>
                    <Badge
                      tone={
                        preview.searchIndexStatus === 'ready'
                          ? 'added'
                          : preview.searchIndexStatus === 'failed'
                            ? 'removed'
                            : 'changed'
                      }
                    >
                      {preview.searchIndexStatus}
                    </Badge>
                  </dd>
                </div>
              ) : null}
            </dl>
            {session.hopKind && searchParams.sessionId && versionId && selectedId ? (
              <PublishForm
                sessionId={searchParams.sessionId}
                versionId={versionId}
                articleId={selectedId}
                hopKind={session.hopKind}
                status={session.status}
                canEdit={canEdit}
                canPublish={canPublish}
                record={preview.changeRecord}
                comment={preview.publishComment}
                structuredDraft={structured}
                diffReview={diffReview}
                canReviewDiff={canReview}
              />
            ) : null}
            {!session.hopKind && session.status === 'approved' && canPublish && searchParams.sessionId && versionId && selectedId ? (
              <LegacyPublishForm sessionId={searchParams.sessionId} versionId={versionId} articleId={selectedId} />
            ) : null}
            {selected ? (
              <>
                <p className="panel-title"><T value={ui.editor.page.preview} /></p>
                {structured && selectedRoot ? <OrderedContentTree entries={[{ type: 'child', node: readerNode(selectedRoot) }]} outline={settings?.outline} /> : <ConstitutionText
                  article={{
                    articleNumber: selected.articleNumber,
                    title: draft?.title ?? selected.title,
                    body: draft?.body ?? selected.body,
                    children: draft ? undefined : selected.children,
                  }}
                  headingLevel="h3"
                  showHeading={false}
                  outline={settings?.outline ?? selectedConstitution?.contentOutline}
                />}
              </>
            ) : null}
          </aside>
        </WorkspaceLayout></EditorDraftState>
      ) : (
        <Alert tone="error"><T value={ui.editor.page.thisSessionCouldNotBeLoadedOr} /></Alert>
      )}
    </WorkspacePage>
  );
}
