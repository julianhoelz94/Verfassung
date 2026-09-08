import { redirect } from 'next/navigation';
import { ArticleFilterList } from '../components/ArticleFilterList';
import { ConstitutionText } from '../components/ConstitutionText';
import { PageMain } from '../components/PageMain';
import { Alert, Badge, Button, Card, DataList, DataRow, Input, PageHeader, Select, WorkflowSteps } from '../components/ui';
import { getArticle, getCountry, listAllArticles, listCountries, type ArticleSummary, type CountryDetail, type CountrySummary } from '../../lib/api';
import { editorErrorMessage, getDraftPreview, listSessions, type EditSessionSummary } from '../../lib/editor-api';
import { currentUser } from '../../lib/session';
import { ArticleEditor } from './ArticleEditor';
import { approveAction, loadSessionAction, openEditorAction, publishAction, reviewAction } from './actions';

type EditorPageProps = {
  searchParams: {
    versionId?: string;
    sessionId?: string;
    articleId?: string;
    saved?: string;
    reviewed?: string;
    approved?: string;
    published?: string;
    newVersionLabel?: string;
    newVersionId?: string;
    error?: string;
    mine?: string;
    status?: string;
  };
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

export default async function EditorPage({ searchParams }: EditorPageProps) {
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
  const country: CountryDetail | null = countries[0]
    ? await getCountry(countries[0].isoCode)
    : null;
  const versions = country?.constitutions.flatMap((constitution) =>
    constitution.versions.map((version) => ({
      ...version,
      constitutionTitle: constitution.title,
    })),
  ) ?? [];
  const versionId = searchParams.versionId ?? session?.versionId ?? versions[0]?.id;
  const selectedConstitution = country?.constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === versionId),
  );
  const selectedVersion = selectedConstitution?.versions.find((version) => version.id === versionId);
  const articles: ArticleSummary[] = versionId ? await listAllArticles(versionId) : [];
  const selectedId = searchParams.articleId ?? articles[0]?.id;
  const selected = selectedId ? await getArticle(selectedId) : null;
  const draft = selected
    ? preview?.drafts?.find((item) => item.articleId === selected.id)
    : undefined;
  const editorReturnTo =
    versionId && searchParams.sessionId && selected
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}&articleId=${encodeURIComponent(selected.id)}`
      : '/editor';
  const articleHrefBase =
    versionId && searchParams.sessionId
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}`
      : '/editor';
  const draftIds = (preview?.drafts ?? []).map((item) => item.articleId);
  const changedLabels = articles
    .filter((article) => draftIds.includes(article.id))
    .map((article) => `Art. ${article.articleNumber}`);
  const errorMessage = editorErrorMessage(searchParams.error);
  const alerts = (
    <>
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? <Alert tone="success">Draft saved.</Alert> : null}
      {searchParams.reviewed ? <Alert tone="success">Submitted for review.</Alert> : null}
      {searchParams.approved ? <Alert tone="success">Review approved. A publisher can now publish.</Alert> : null}
      {searchParams.published ? (
        <Alert tone="success">
          {searchParams.newVersionLabel
            ? `Published as version ${searchParams.newVersionLabel}.`
            : 'Published as a new version.'}
        </Alert>
      ) : null}
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
        <div className="card-grid">
          {canEdit && versions.length > 0 ? (
            <Card>
              <h2 className="card-title">Open a session</h2>
              <form action={openEditorAction}>
                <Select id="versionId" name="versionId" label="Version" defaultValue={versionId}>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.constitutionTitle} {version.versionLabel}
                    </option>
                  ))}
                </Select>
                <Button variant="primary">Open session</Button>
              </form>
            </Card>
          ) : null}
          <Card>
            <h2 className="card-title">Load a session</h2>
            <form action={loadSessionAction} className="form-row">
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
    country && versionId ? `/countries/${country.isoCode}/versions/${encodeURIComponent(versionId)}` : undefined;
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
        eyebrow={`Edit session · ${session.status}`}
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
        <div className="workspace">
          <aside className="panel" aria-label="Articles">
            <h2 className="panel-title">Articles</h2>
            <p className="muted">{draftIds.length} changed</p>
            <ArticleFilterList
              articles={articles}
              selectedId={selected?.id}
              hrefBase={articleHrefBase}
              draftIds={draftIds}
            />
          </aside>
          <section className="panel" aria-labelledby="edit-title">
            <p className="panel-title" id="edit-title">
              {selected ? `Article ${selected.articleNumber}` : 'Article'}
            </p>
            {canSave && selected && versionId && searchParams.sessionId ? (
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
                outline={selectedConstitution?.contentOutline}
                canEditTitles
                returnTo={editorReturnTo}
              />
            ) : null}
            {selected && versionId && searchParams.sessionId && canEdit && session.status === 'open' && selected.children && selected.children.length > 0 ? (
              <details>
                <summary className="btn btn-sm">Section titles</summary>
                <p className="muted">Name nested layers such as paragraphs. Titles are stored on the published tree.</p>
                <ConstitutionText
                  nodes={selected.children}
                  showHeading={false}
                  outline={selectedConstitution?.contentOutline}
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
              {canSave ? (
                <Button form="draft-form" variant="primary">
                  Save draft
                </Button>
              ) : null}
              {canEdit && session.status === 'open' ? (
                <form action={reviewAction}>
                  {hiddenFields}
                  <Button>Submit for review</Button>
                </form>
              ) : null}
              {canReview && session.status === 'reviewing' ? (
                <form action={approveAction}>
                  {hiddenFields}
                  <Button>Approve review</Button>
                </form>
              ) : null}
              {canPublish && session.status === 'approved' ? (
                <form action={publishAction}>
                  {hiddenFields}
                  <Button variant="primary">Publish</Button>
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
            </dl>
            {selected ? (
              <>
                <p className="panel-title">Preview</p>
                <ConstitutionText
                  article={{
                    articleNumber: selected.articleNumber,
                    title: draft?.title ?? selected.title,
                    body: draft?.body ?? selected.body,
                    children: draft ? undefined : selected.children,
                  }}
                  headingLevel="h3"
                  showHeading={false}
                  outline={selectedConstitution?.contentOutline}
                />
              </>
            ) : null}
          </aside>
        </div>
      ) : (
        <Alert tone="error">This session could not be loaded, or the version has no articles yet.</Alert>
      )}
    </PageMain>
  );
}
