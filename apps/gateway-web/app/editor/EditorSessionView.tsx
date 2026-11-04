import { statusMessage } from '../../lib/ui-labels';
import { message, ui } from '../../lib/messages';
import { T } from '../components/TranslationProvider';
import { ArticleFilterList } from '../components/ArticleFilterList';
import { ConstitutionText } from '../components/ConstitutionText';
import { WorkspacePage } from '../components/layout/templates';
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  WorkflowSteps,
} from '../components/ui';
import { ArticleEditor } from './ArticleEditor';
import { EditorDraftState, SubmitReviewButton } from './EditorDraftState';
import { findUnitRoot } from '../../lib/structured-editor';
import { StructuredEditor } from './StructuredEditor';
import { PublishForm } from './PublishForm';
import { LegacyPublishForm } from './LegacyPublishForm';
import { reviewUi } from '../../lib/ui-review-messages';
import { Stack } from '../components/layout/Layout';
import { workflowUi } from '../../lib/workflow-messages';
import surfaceStyles from '../components/surfaces.module.css';
import { sourceEvidenceUi } from '../../lib/source-evidence-messages';
import {
  indexDraftFootnotes,
  indexDraftFootnoteReferences,
} from '../../lib/draft-footnotes';
import { EditorWorkspace } from './EditorWorkspace';
import { changeExcerpt } from '../../lib/editor-change-context';
import { ConstitutionDetailsWorkspace } from './ConstitutionDetailsWorkspace';
import { ConstitutionWikiPanel } from './wiki/WikiWorkspace';
import shellStyles from './editor-shell.module.css';
import type { EditorSessionState } from './editor-page-state';
type Structured = NonNullable<EditorSessionState['structured']>;
/** Renders command-result messages in their original order and with fixed localized copy. */
function EditorPageAlerts({ state }: { state: EditorSessionState }) {
  const { searchParams, errorMessage, publishedHref } = state;
  return (
    <>
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? (
        <Alert tone="success">
          <T value={ui.editor.page.draftSaved} />
        </Alert>
      ) : null}
      {searchParams.detailsSaved ? (
        <Alert tone="success">
          <T value={ui.editor.page.publishDetailsSaved} />
        </Alert>
      ) : null}
      {searchParams.reviewed ? (
        <Alert tone="success">
          <T value={ui.editor.page.submittedForReview} />
        </Alert>
      ) : null}
      {searchParams.approved ? (
        <Alert tone="success">
          <T value={ui.editor.page.reviewApprovedAPublisherCanNowPublish} />
        </Alert>
      ) : null}
      {searchParams.published ? (
        <Alert tone="success">
          {searchParams.newVersionLabel ? (
            <>
              <T value={ui.editorDynamic.publishedAsVersion} />{' '}
              {searchParams.newVersionLabel}
              {searchParams.amendmentTitle
                ? ` · ${searchParams.amendmentTitle}`
                : ''}
              .
            </>
          ) : (
            <T value={ui.editorDynamic.publishedNewVersion} />
          )}
          {publishedHref ? (
            <>
              {' '}
              <a href={publishedHref}>
                <T value={workflowUi.publishedVersion} />
              </a>
            </>
          ) : null}
        </Alert>
      ) : null}
      {searchParams.amendmentPending ? (
        <Alert tone="error">
          <T value={ui.editor.page.theSnapshotWasPublishedButTheChange} />
        </Alert>
      ) : null}
    </>
  );
}
/** Pins submitted commands to the displayed session, unit and source-evidence revision. */
function EditorHiddenFields({ state }: { state: EditorSessionState }) {
  const { searchParams, preview, versionId, selectedId } = state;
  return (
    <>
      <input type="hidden" name="sessionId" value={searchParams.sessionId} />
      <input type="hidden" name="versionId" value={versionId ?? ''} />
      <input type="hidden" name="articleId" value={selectedId ?? ''} />
      <input
        type="hidden"
        name="sourceEvidenceRevision"
        value={preview.sourceEvidenceRevisions?.[0]?.revision ?? ''}
      />
    </>
  );
}
/** Renders the unchanged top-level unit navigation and published-session draft markers. */
function EditorNavigation({ state }: { state: EditorSessionState }) {
  const {
    locale,
    session,
    displayOutline,
    articles,
    selected,
    articleHrefBase,
    draftIds,
  } = state;
  return (
    <aside
      className={['panel', surfaceStyles.panel].join(' ')}
      aria-label={message(locale, ui.accessibility.topLevelUnits)}
    >
      <h2 className="panel-title">
        <T
          value={
            articles.every(
              (article) => (article.kind ?? 'article') === 'article',
            )
              ? ui.editorDynamic.articles
              : ui.editorDynamic.topLevelUnits
          }
        />
      </h2>
      <p className="muted">
        {draftIds.length} <T value={ui.editor.page.changed} />
      </p>
      <ArticleFilterList
        articles={articles}
        selectedId={selected?.id}
        hrefBase={articleHrefBase}
        draftIds={session.status === 'published' ? [] : draftIds}
        outline={displayOutline}
      />
    </aside>
  );
}
/** Keeps modern and legacy publishing gates aligned with role and lifecycle state. */
function EditorPublishControls({ state }: { state: EditorSessionState }) {
  const {
    searchParams,
    preview,
    session,
    canEdit,
    canReview,
    canPublish,
    versionId,
    displayOutline,
    structured,
    diffReview,
    selectedId,
  } = state;
  return (
    <>
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
          outline={displayOutline}
          diffReview={diffReview}
          canReviewDiff={canReview}
          sourceEvidenceRevision={
            preview.sourceEvidenceRevisions?.[0]?.revision
          }
        />
      ) : null}
      {!session.hopKind &&
      session.status === 'approved' &&
      canPublish &&
      searchParams.sessionId &&
      versionId &&
      selectedId ? (
        <LegacyPublishForm
          sessionId={searchParams.sessionId}
          versionId={versionId}
          articleId={selectedId}
        />
      ) : null}
    </>
  );
}
/** Displays provenance and review/publication controls without changing session capability gates. */
function EditorSessionSidebar({ state }: { state: EditorSessionState }) {
  const {
    locale,
    user,
    preview,
    session,
    changedLabels,
    publishedHref,
    publicHref,
  } = state;
  return (
    <aside
      className={['panel panel-side', surfaceStyles.panel].join(' ')}
      aria-label={message(locale, ui.accessibility.session)}
    >
      <p className="panel-title">
        <T value={ui.editor.page.session} />
      </p>
      <WorkflowSteps status={session.status} />
      {publicHref ? (
        <a className="btn btn-ghost" href={publicHref}>
          <T
            value={
              publishedHref
                ? workflowUi.publishedVersion
                : workflowUi.sourceVersion
            }
          />
        </a>
      ) : null}
      <dl className="provenance provenance-list">
        <div>
          <dt>
            <T value={ui.editor.page.status} />
          </dt>
          <dd>
            <Badge tone="changed">
              {<T value={statusMessage(session.status)} />}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>
            <T value={ui.editor.page.openedBy} />
          </dt>
          <dd>
            {session.actorId === user.id
              ? message(locale, ui.editorDynamic.you)
              : session.actorId.slice(0, 8)}
          </dd>
        </div>
        <div>
          <dt>
            <T value={ui.editor.page.changedArticles} />
          </dt>
          <dd>
            {changedLabels.length > 0
              ? changedLabels.join(', ')
              : message(locale, ui.editorDynamic.noneYet)}
          </dd>
        </div>
        <div>
          <dt>
            <T value={ui.editor.page.revisions} />
          </dt>
          <dd>{session.revisionCount}</dd>
        </div>
        {preview.searchIndexStatus ? (
          <div>
            <dt>
              <T value={ui.editor.page.searchIndex} />
            </dt>
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
      <EditorPublishControls state={state} />
    </aside>
  );
}
/** Chooses structured editing, legacy editing or the shared read-only renderer from the loaded selection. */
function editorDocumentBody(state: EditorSessionState) {
  const {
    searchParams,
    user,
    preview,
    session,
    canEdit,
    canPublish,
    versionId,
    selectedCountry,
    selectedConstitution,
    settings,
    structured,
    selectedRoot,
    selected,
    draft,
    editorReturnTo,
    canSave,
  } = state;
  if (
    structured &&
    selectedRoot &&
    settings &&
    versionId &&
    selected &&
    selectedConstitution
  ) {
    return (
      <StructuredEditor
        initialTab={initialTab(searchParams.tab)}
        wikiPanel={
          selectedCountry ? (
            <ConstitutionWikiPanel
              constitutionId={selectedConstitution.id}
              code={selectedCountry.isoCode}
              returnTo={editorReturnTo}
              historyPage={searchParams.wikiHistoryPage}
              status={wikiStatus(searchParams.wikiStatus)}
            />
          ) : undefined
        }
        detailsPanel={
          <ConstitutionDetailsWorkspace
            constitutionId={selectedConstitution.id}
            versionId={versionId}
            code={selectedCountry?.isoCode}
            canEdit={canEdit}
            canManageStructure={user.roles.includes('admin')}
            canPublish={canPublish}
          />
        }
        key={`${session.id}:${structured.generation}:${selectedRoot.logicalId}`}
        review={reviewChanges(state)}
        preview={selectedPreview(structured, selectedRoot.logicalId)}
        outline={settings.outline}
        rootId={selectedRoot.logicalId}
        versionId={versionId}
        articleId={selected.id}
        constitutionId={selectedConstitution.id}
        canManageStructure={user.roles.includes('admin')}
        publishedVersionId={preview.newVersionId}
        unitMapping={preview.unitMapping}
        editable={canSave && session.actorId === user.id}
        scope={searchParams.scope}
        selectedNode={searchParams.selectedNode}
      />
    );
  }
  if (canSave && selected && versionId && searchParams.sessionId) {
    return (
      <ArticleEditor
        sessionId={searchParams.sessionId}
        versionId={versionId}
        articleId={selected.id}
        title={draft?.title ?? selected.title}
        body={draft?.body ?? selected.body}
      />
    );
  }
  if (selected) {
    return (
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
    );
  }
  return null;
}
/** Offers nested legacy title editing only on an open editable legacy session. */
function EditorSectionTitles({ state }: { state: EditorSessionState }) {
  const {
    searchParams,
    session,
    canEdit,
    versionId,
    selectedConstitution,
    settings,
    structured,
    selected,
    editorReturnTo,
  } = state;
  return (
    <>
      {selected &&
      versionId &&
      searchParams.sessionId &&
      canEdit &&
      session.status === 'open' &&
      !structured &&
      selected.children &&
      selected.children.length > 0 ? (
        <details>
          <summary className="btn btn-sm">
            <T value={ui.editor.page.sectionTitles} />
          </summary>
          <p className="muted">
            <T value={ui.editor.page.nameNestedLayersSuchAsParagraphsTitles} />
          </p>
          <ConstitutionText
            nodes={selected.children}
            showHeading={false}
            outline={settings?.outline ?? selectedConstitution?.contentOutline}
            canEditTitles
            returnTo={editorReturnTo}
          />
        </details>
      ) : null}
    </>
  );
}
/** Retains review requirements and role-specific next commands on the current session. */
function EditorSessionActions({ state }: { state: EditorSessionState }) {
  const { session, canEdit, canReview, submissionRequirements } = state;
  return (
    <div className="action-bar">
      {canEdit && session.status === 'open' ? (
        <a className="btn" href="/editor">
          <T value={reviewUi.returnToSessions} />{' '}
        </a>
      ) : null}
      {canEdit && session.status === 'open' ? (
        <Stack as="form" action="/editor/command" method="post">
          <input type="hidden" name="command" value="review" />
          <EditorHiddenFields state={state} />
          <SubmitReviewButton
            disabled={submissionRequirements.length > 0}
            requirements={submissionRequirements}
          />
        </Stack>
      ) : null}
      {canReview && session.status === 'reviewing' ? (
        <Stack as="form" action="/editor/command" method="post">
          <input type="hidden" name="command" value="approve" />
          <EditorHiddenFields state={state} />
          <Button>
            <T value={ui.editor.page.approveReview} />
          </Button>
        </Stack>
      ) : null}
    </div>
  );
}
/** Preserves the document section surface, accessible heading and command placement. */
function EditorDocumentSection({ state }: { state: EditorSessionState }) {
  const { locale, kindLabel, structured, selectedRoot, selected } = state;
  return (
    <section
      className={
        structured && selectedRoot
          ? shellStyles.documentSection
          : ['panel', surfaceStyles.panel].join(' ')
      }
      aria-labelledby="edit-title"
    >
      <p
        className={structured && selectedRoot ? 'sr-only' : 'panel-title'}
        id="edit-title"
      >
        {selected
          ? `${kindLabel(selected.kind)} ${selected.articleNumber}`
          : message(locale, ui.editorDynamic.unit)}
      </p>
      {editorDocumentBody(state)}
      <EditorSectionTitles state={state} />
      <EditorSessionActions state={state} />
    </section>
  );
}
/** Enriches draft differences with complete-root excerpts and pinned public source/target links. */
function reviewChanges(state: EditorSessionState) {
  const { preview, structured, differences } = state;
  if (!structured) return [];
  return differences.map((difference) => {
    const sourceRoot = findUnitRoot(structured.sourceRoots, difference.logicalId);
    const targetRoot = findUnitRoot(structured.roots, difference.logicalId);
    const targetOccurrence =
      targetRoot && preview.unitMapping?.[targetRoot.logicalId];
    return {
      ...difference,
      beforeText: ['rich', 'inserted', 'removed'].includes(difference.field)
        ? changeExcerpt(structured.sourceRoots, difference.logicalId)
        : undefined,
      afterText: ['rich', 'inserted', 'removed'].includes(difference.field)
        ? changeExcerpt(structured.roots, difference.logicalId)
        : undefined,
      rootId: (targetRoot ?? sourceRoot)?.logicalId,
      sourceLink: sourceRoot?.occurrenceId
        ? `/versions/${structured.sourceVersionId}/units/${sourceRoot.occurrenceId}`
        : undefined,
      targetLink:
        preview.newVersionId && targetOccurrence
          ? `/versions/${preview.newVersionId}/units/${targetOccurrence}`
          : undefined,
    };
  });
}
/** Keeps global note indexes complete while rendering only the selected root body. */
function selectedPreview(structured: Structured, selectedRootId: string) {
  return {
    ...structured,
    footnotes: indexDraftFootnotes(structured.roots),
    footnoteReferences: indexDraftFootnoteReferences(structured.roots),
    roots: structured.roots.map((root) =>
      root.logicalId === selectedRootId ? root : { ...root, content: [] },
    ),
    sourceRoots: structured.sourceRoots.map((root) =>
      root.logicalId === selectedRootId ? root : { ...root, content: [] },
    ),
  };
}
/** Unknown tab query values retain the default editing tab. */
function initialTab(tab?: string) {
  return tab === 'wiki' ? 'wiki' : tab === 'details' ? 'details' : undefined;
}
/** Wiki command-result values remain a closed set before reaching the workspace. */
function wikiStatus(status?: string) {
  return status === 'saved' || status === 'published' || status === 'error'
    ? status
    : undefined;
}
/** Composes the existing editor surfaces from one loaded, authorized session view model. */
export function EditorSessionView({ state }: { state: EditorSessionState }) {
  const {
    locale,
    searchParams,
    preview,
    session,
    structured,
    articles,
    selectedRoot,
    title,
  } = state;
  return (
    <WorkspacePage
      width="content"
      gap="control"
      className={shellStyles.page}
      header={
        <PageHeader
          compact
          eyebrow={`${message(locale, session.hopKind === 'legal' ? ui.remainingStatus.nextLegalChange : ui.remainingStatus.transcriptionCorrection)} · ${message(locale, session.status === 'open' ? ui.workflow.draft : session.status === 'reviewing' ? ui.workflow.inReview : session.status === 'approved' ? ui.workflow.approved : ui.workflow.published)}`}
          title={title || <T value={ui.nav.editor} />}
        />
      }
    >
      <EditorPageAlerts state={state} />
      {preview.sourceEvidenceRevisions?.length ? (
        <Alert tone="info">
          <a
            href={`/editor?sessionId=${encodeURIComponent(session.id)}&scope=sources`}
          >
            <T value={sourceEvidenceUi.inspectSources} />
          </a>
        </Alert>
      ) : null}
      {searchParams.sessionId && articles.length > 0 ? (
        <EditorDraftState>
          <EditorWorkspace
            inlineControls={Boolean(structured && selectedRoot)}
            navigation={<EditorNavigation state={state} />}
            session={<EditorSessionSidebar state={state} />}
          >
            <EditorDocumentSection state={state} />
          </EditorWorkspace>
        </EditorDraftState>
      ) : (
        <Alert tone="error">
          <T value={ui.editor.page.thisSessionCouldNotBeLoadedOr} />
        </Alert>
      )}
    </WorkspacePage>
  );
}
