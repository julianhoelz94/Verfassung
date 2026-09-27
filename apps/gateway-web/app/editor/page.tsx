import { redirect } from 'next/navigation';
import { ArticleFilterList } from '../components/ArticleFilterList';
import { ConstitutionText } from '../components/ConstitutionText';
import { PageMain } from '../components/PageMain';
import { Alert, Badge, Button, Card, DataList, DataRow, Input, PageHeader, Select, WorkflowSteps } from '../components/ui';
import { getCountry, listAllArticles, getArticle, listAllUnits, getUnit, getVersionSettings, listCountries, type ArticleSummary, type CountryDetail, type CountrySummary } from '../../lib/api';
import { editorErrorMessage, getDraftPreview, getStructuredDraft, listSessions, type EditSessionSummary } from '../../lib/editor-api';
import { currentUser } from '../../lib/session';
import { ArticleEditor } from './ArticleEditor';
import { EditorDraftState, SubmitReviewButton } from './EditorDraftState';
import { draftDifferences, nodes, readerNode } from '../../lib/structured-editor';
import { OrderedContentTree } from '../components/ConstitutionText';
import { StructuredEditor } from './StructuredEditor';
import { PublishForm } from './PublishForm';
import { LegacyPublishForm } from './LegacyPublishForm';

type EditorPageProps = {
  searchParams: Promise<{
    country?: string;
    constitutionId?: string;
    scope?: string;
    selectedNode?: string;
    versionId?: string;
    sessionId?: string;
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

async function safeListSessions(filters: { status?: string; openedBy?: string }): Promise<EditSessionSummary[]> {
  try {
    return await listSessions(filters);
  } catch {
    return [];
  }
}

function sessionHref(session: EditSessionSummary): string {
  return `/editor?sessionId=${encodeURIComponent(session.id)}&versionId=${encodeURIComponent(session.versionId)}`;
}

function formatOpened(iso: string): string {
  return iso.slice(0, 10);
}

function SessionTable({
  title,
  sessions,
  empty,
}: {
  title: string;
  sessions: EditSessionSummary[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {sessions.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <DataList columns={5}>
          {sessions.map((session) => (
            <DataRow
              key={session.id}
              cells={[
                { label: 'Session', value: <a href={sessionHref(session)}>{session.id.slice(0, 8)}</a> },
                { label: 'Version', value: session.versionId.slice(0, 8) },
                {
                  label: 'Status',
                  value: <Badge tone={session.status === 'approved' ? 'added' : 'changed'}>{session.status}</Badge>,
                },
                { label: 'Changed', value: String(session.changedArticleCount) },
                { label: 'Opened', value: formatOpened(session.openedAt) },
              ]}
            />
          ))}
        </DataList>
      )}
    </section>
  );
}

export default async function EditorPage(props: EditorPageProps) {
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
      <PageMain>
        <PageHeader title="Editor" meta={`Signed in as ${user.email}, but this account has no editorial role.`} />
      </PageMain>
    );
  }

  const preview = searchParams.sessionId ? await getDraftPreview(searchParams.sessionId) : null;
  const session = preview?.session;

  let countries: CountrySummary[] = [];
  try {
    countries = (await listCountries()) ?? [];
  } catch {
    countries = [];
  }
  const countryDetails: CountryDetail[] = (await Promise.all(countries.map((item) => getCountry(item.isoCode))))
    .filter((item): item is CountryDetail => item !== null);
  const versions = countryDetails.flatMap((country) => country.constitutions.flatMap((constitution) =>
    constitution.versions.map((version) => ({
      ...version,
      snapshotId: version.currentVersionId ?? version.id,
      constitutionTitle: constitution.title,
      constitutionId: constitution.id,
      countryCode: country.isoCode,
    })),
  ));
  const availableVersions = versions.filter(version => (!searchParams.country || version.countryCode === searchParams.country) && (!searchParams.constitutionId || version.constitutionId === searchParams.constitutionId));
  const legalTips = availableVersions.filter((version) => version.latestPublished);
  const versionId = session?.versionId ?? searchParams.versionId ?? availableVersions[0]?.snapshotId;
  const selectedCountry = countryDetails.find((country) => country.constitutions.some((constitution) =>
    constitution.versions.some((version) => version.id === versionId || version.currentVersionId === versionId),
  ));
  const selectedConstitution = selectedCountry?.constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === versionId || version.currentVersionId === versionId),
  );
  const selectedVersion = selectedConstitution?.versions.find((version) => version.id === versionId || version.currentVersionId === versionId);
  const settings = session && versionId ? await getVersionSettings(versionId) : null;
  const units: ArticleSummary[] = versionId ? await listAllUnits(versionId) : [];
  const legacySource = units.some(unit => unit.legacyIdentity);
  const structured = session && !legacySource && !(preview?.drafts?.length) ? await getStructuredDraft(session.id) : null;
  const sourceArticles: ArticleSummary[] = legacySource && versionId ? await listAllArticles(versionId) : units;
  const articles: ArticleSummary[] = structured ? structured.roots.map((root, index) => ({
    id: sourceArticles.find(article => article.logicalId === root.logicalId)?.id ?? root.logicalId,
    versionId: versionId!, articleNumber: root.label ?? '', title: root.title ?? '', sortOrder: index + 1,
    kind: root.kind, logicalId: root.logicalId,
  })) : sourceArticles;
  const selectionRoot = searchParams.selectedNode ? structured?.roots.find(root => nodes([root]).some(node => node.logicalId === searchParams.selectedNode || node.content.some(entry => entry.logicalId === searchParams.selectedNode))) : undefined;
  const selectedId = articles.find(article => article.logicalId === selectionRoot?.logicalId)?.id ?? (articles.some(article => article.id === searchParams.articleId) ? searchParams.articleId : articles[0]?.id);
  const selectedSummary = articles.find(article => article.id === selectedId);
  const selectedRoot = structured?.roots.find(root => root.logicalId === selectedSummary?.logicalId);
  const selected = selectedRoot && selectedSummary ? { ...selectedSummary, body: '', content: selectedRoot.content as import('../../lib/api').OrderedEntry[] } : selectedId && versionId ? legacySource ? await getArticle(selectedId) : await getUnit(versionId, selectedId) : null;
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
    .map((article) => `${article.kind ?? 'Unit'} ${article.articleNumber}`);
  if (structured) sourceArticles.filter(article => article.logicalId && changedRootIds.includes(article.logicalId) && !articles.some(target => target.logicalId === article.logicalId)).forEach(article => changedLabels.push(`Removed ${article.kind ?? 'Unit'} ${article.articleNumber}`));
  const errorMessage = editorErrorMessage(searchParams.error);
  const alerts = (
    <>
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? <Alert tone="success">Draft saved.</Alert> : null}
      {searchParams.detailsSaved ? <Alert tone="success">Publish details saved.</Alert> : null}
      {searchParams.reviewed ? <Alert tone="success">Submitted for review.</Alert> : null}
      {searchParams.approved ? <Alert tone="success">Review approved. A publisher can now publish.</Alert> : null}
      {searchParams.published ? (
        <Alert tone="success">
          {searchParams.newVersionLabel
            ? `Published as version ${searchParams.newVersionLabel}${searchParams.amendmentTitle ? ` · ${searchParams.amendmentTitle}` : ''}.`
            : 'Published as a new version.'}
        </Alert>
      ) : null}
      {searchParams.amendmentPending ? <Alert tone="error">The snapshot was published, but the change record or review status is pending retry.</Alert> : null}
    </>
  );

  if (!session) {
    const listMine = searchParams.mine === '1' || (!searchParams.status && canEdit);
    const listReview = searchParams.status === 'reviewing' || (!searchParams.mine && !searchParams.status && (canEdit || canReview));
    const listApproved = searchParams.status === 'approved' || (!searchParams.mine && !searchParams.status && canPublish);
    const [mine, reviewing, approved] = await Promise.all([
      listMine ? safeListSessions({ openedBy: 'me' }) : Promise.resolve([]),
      listReview ? safeListSessions({ status: 'reviewing' }) : Promise.resolve([]),
      listApproved ? safeListSessions({ status: 'approved' }) : Promise.resolve([]),
    ]);
    const focused =
      searchParams.mine === '1' ? 'My sessions' : searchParams.status === 'reviewing' ? 'Review queue' : searchParams.status === 'approved' ? 'Ready to publish' : null;
    return (
      <PageMain className="wide">
        <PageHeader
          title="Editor"
          eyebrow={focused ?? 'Editorial workspace'}
          meta={`Signed in as ${user.email}. Roles: ${user.roles.join(', ')}.`}
        />
        {alerts}
        <form action="/editor" method="get" className="form-row">
          <Select id="country" name="country" label="Country" defaultValue={searchParams.country ?? ''}><option value="">All countries</option>{countries.map(country => <option key={country.isoCode} value={country.isoCode}>{country.isoCode}</option>)}</Select>
          <Select id="constitutionId" name="constitutionId" label="Constitution" defaultValue={searchParams.constitutionId ?? ''}><option value="">All constitutions</option>{countryDetails.filter(country => !searchParams.country || country.isoCode === searchParams.country).flatMap(country => country.constitutions.map(constitution => <option key={constitution.id} value={constitution.id}>{country.isoCode} · {constitution.title}</option>))}</Select>
          <Button>Choose constitution</Button>
        </form>
        <div className="card-grid">
          {canEdit && versions.length > 0 ? (
            <Card>
              <h2 className="card-title">Record the next legal change</h2>
              {legalTips.length > 0 ? <form action="/editor/command" method="post">
                <input type="hidden" name="command" value="open" />
                <input type="hidden" name="hopKind" value="legal" />
                <Select id="legalVersionId" name="versionId" label="Current law" defaultValue={legalTips[0].snapshotId}>
                  {legalTips.map((version) => (
                    <option key={version.id} value={version.snapshotId}>
                      {version.countryCode} · {version.constitutionTitle} {version.versionLabel}
                    </option>
                  ))}
                </Select>
                <Button variant="primary">Record the next legal change</Button>
              </form> : null}
              <form action="/editor/command" method="post">
                <input type="hidden" name="command" value="open" />
                <input type="hidden" name="hopKind" value="editorial_correction" />
                <Select id="correctionVersionId" name="versionId" label="Correct this text" defaultValue={versionId}>
                  {availableVersions.map((version) => (
                    <option key={version.id} value={version.snapshotId}>
                      {version.countryCode} · {version.constitutionTitle} {version.versionLabel}
                    </option>
                  ))}
                </Select>
                <Button>Correct this text</Button>
              </form>
            </Card>
          ) : null}
          <Card>
            <h2 className="card-title">Load a session</h2>
            <form action="/editor/command" method="post" className="form-row">
              <input type="hidden" name="command" value="load" />
              <input type="hidden" name="versionId" value={versionId ?? ''} />
              <Input id="loadSessionId" name="sessionId" label="Session id" defaultValue={searchParams.sessionId ?? ''} />
              <Button>Load session</Button>
            </form>
          </Card>
        </div>
        {canEdit && versions.length === 0 ? <p>No published versions available.</p> : null}
        {listMine ? (
          <SessionTable title="My sessions" sessions={mine} empty="You have not opened a session yet." />
        ) : null}
        {listReview ? (
          <SessionTable title="Review queue" sessions={reviewing} empty="No sessions are waiting for review." />
        ) : null}
        {listApproved ? (
          <SessionTable title="Ready to publish" sessions={approved} empty="No sessions are approved for publish." />
        ) : null}
      </PageMain>
    );
  }

  const title = `${selectedConstitution?.title ?? 'Constitution'} · ${selectedVersion?.versionLabel ?? ''}`.trim();
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
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[{ href: '/editor', label: 'Editor' }, { label: `Session ${session.id.slice(0, 8)}` }]}
        eyebrow={`${session.hopKind === 'legal' ? 'Next legal change' : 'Transcription correction'} · ${session.status}`}
        title={title || 'Editor'}
        meta={<WorkflowSteps status={session.status} />}
        actions={
          publicHref ? (
            <a className="btn btn-ghost" href={publicHref}>
              View public page
            </a>
          ) : null
        }
      />
      {alerts}
      {searchParams.sessionId && articles.length > 0 ? (
        <EditorDraftState><div className="workspace">
          <aside className="panel" aria-label="Top-level units">
            <h2 className="panel-title">{(settings?.outline ?? selectedConstitution?.contentOutline)?.kinds[0]?.kindCode === 'article' ? 'Articles' : 'Top-level units'}</h2>
            <p className="muted">{draftIds.length} changed</p>
            <ArticleFilterList
              articles={articles}
              selectedId={selected?.id}
              hrefBase={articleHrefBase}
              draftIds={draftIds}
              unitLabel={settings?.outline.kinds[0]?.kindCode === 'article' ? undefined : settings?.outline.kinds[0]?.displayLabel}
            />
          </aside>
          <section className="panel" aria-labelledby="edit-title">
            <p className="panel-title" id="edit-title">
              {selected ? `${selected.kind ?? 'Unit'} ${selected.articleNumber}` : 'Unit'}
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
                <summary className="btn btn-sm">Section titles</summary>
                <p className="muted">Name nested layers such as paragraphs. Titles are stored on the published tree.</p>
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
                  Discard changes
                </a>
              ) : null}
              {canEdit && session.status === 'open' ? (
                <form action="/editor/command" method="post">
                  <input type="hidden" name="command" value="review" />
                  {hiddenFields}
                  <SubmitReviewButton disabled={session.hopKind === 'legal' ? !preview.changeRecord : session.hopKind === 'editorial_correction' ? !preview.publishComment : false} />
                </form>
              ) : null}
              {canReview && session.status === 'reviewing' ? (
                <form action="/editor/command" method="post">
                  <input type="hidden" name="command" value="approve" />
                  {hiddenFields}
                  <Button>Approve review</Button>
                </form>
              ) : null}
            </div>
          </section>
          <aside className="panel panel-side" aria-label="Session">
            <p className="panel-title">Session</p>
            <dl className="provenance provenance-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge tone="changed">{session.status}</Badge>
                </dd>
              </div>
              <div>
                <dt>Opened by</dt>
                <dd>{session.actorId === user.id ? 'you' : session.actorId.slice(0, 8)}</dd>
              </div>
              <div>
                <dt>Changed articles</dt>
                <dd>{changedLabels.length > 0 ? changedLabels.join(', ') : 'None yet'}</dd>
              </div>
              <div>
                <dt>Revisions</dt>
                <dd>{session.revisionCount}</dd>
              </div>
              {preview.searchIndexStatus ? (
                <div>
                  <dt>Search index</dt>
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
              />
            ) : null}
            {!session.hopKind && session.status === 'approved' && canPublish && searchParams.sessionId && versionId && selectedId ? (
              <LegacyPublishForm sessionId={searchParams.sessionId} versionId={versionId} articleId={selectedId} />
            ) : null}
            {selected ? (
              <>
                <p className="panel-title">Preview</p>
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
        </div></EditorDraftState>
      ) : (
        <Alert tone="error">This session could not be loaded, or the version has no top-level units yet.</Alert>
      )}
    </PageMain>
  );
}
