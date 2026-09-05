import { redirect } from 'next/navigation';
import { ConstitutionText } from '../components/ConstitutionText';
import { PageMain } from '../components/PageMain';
import { Alert, Button, Input, Select } from '../components/ui';
import { getArticle, getCountry, listArticles, listCountries, type ArticleSummary, type CountryDetail, type CountrySummary } from '../../lib/api';
import { getDraftPreview } from '../../lib/editor-api';
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
    error?: string;
  };
};

function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role) || roles.includes('admin');
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
        <p>Signed in as {user.email}, but this account has no editorial role.</p>
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
  const articles: ArticleSummary[] = versionId ? ((await listArticles(versionId)) ?? []) : [];
  const selectedId = searchParams.articleId ?? articles[0]?.id;
  const selected = selectedId ? await getArticle(selectedId) : null;
  const draft = selected
    ? preview?.drafts?.find((item) => item.articleId === selected.id)
    : undefined;
  const editorReturnTo =
    versionId && searchParams.sessionId && selected
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}&articleId=${encodeURIComponent(selected.id)}`
      : '/editor';

  return (
    <PageMain>
      <h1>Editor</h1>
      <p>
        Signed in as {user.email}. Roles: {user.roles.join(', ')}.
      </p>
      {searchParams.error ? <Alert tone="error">{searchParams.error}</Alert> : null}
      {searchParams.saved ? <Alert tone="success">Draft saved.</Alert> : null}
      {searchParams.reviewed ? <Alert tone="success">Submitted for review.</Alert> : null}
      {searchParams.approved ? <Alert tone="success">Review approved. A publisher can now publish.</Alert> : null}
      {searchParams.published ? <Alert tone="success">Published. Public article text for this version was updated.</Alert> : null}
      {session ? <p>Session {session.id} is {session.status}.</p> : null}

      {canEdit && versions.length > 0 ? (
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
      ) : null}

      {canReview || canPublish ? (
        <form action={loadSessionAction} className="form-row">
          <input type="hidden" name="versionId" value={versionId ?? ''} />
          <Input id="loadSessionId" name="sessionId" label="Session id" defaultValue={searchParams.sessionId ?? ''} />
          <Button>Load session</Button>
        </form>
      ) : null}

      {canEdit && versions.length === 0 ? <p>No published versions available.</p> : null}

      {searchParams.sessionId && articles.length > 0 ? (
        <>
          <h2>Articles</h2>
          <ul>
            {articles.map((article) => (
              <li key={article.id}>
                <a
                  href={`/editor?versionId=${encodeURIComponent(versionId ?? '')}&sessionId=${encodeURIComponent(searchParams.sessionId ?? '')}&articleId=${encodeURIComponent(article.id)}`}
                >
                  Art. {article.articleNumber} {article.title}
                </a>
              </li>
            ))}
          </ul>
          {selected && versionId && searchParams.sessionId && canEdit && session?.status === 'open' ? (
            <>
              <ArticleEditor
                sessionId={searchParams.sessionId}
                versionId={versionId}
                articleId={selected.id}
                title={draft?.title ?? selected.title}
                body={draft?.body ?? selected.body}
              />
              {selected.children && selected.children.length > 0 ? (
                <section>
                  <h2>Section titles</h2>
                  <p className="muted">Name nested layers such as paragraphs. Titles are stored on the published tree.</p>
                  <ConstitutionText
                    nodes={selected.children}
                    showHeading={false}
                    outline={selectedConstitution?.contentOutline}
                    canEditTitles
                    returnTo={editorReturnTo}
                  />
                </section>
              ) : null}
            </>
          ) : null}
          {selected && (!canEdit || session?.status !== 'open') ? (
            <section>
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
            </section>
          ) : null}
          {canEdit && session?.status === 'open' ? (
            <form action={reviewAction} className="form-row">
              <input type="hidden" name="sessionId" value={searchParams.sessionId} />
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="articleId" value={selectedId ?? ''} />
              <Button>Submit for review</Button>
            </form>
          ) : null}
          {canReview && session?.status === 'reviewing' ? (
            <form action={approveAction} className="form-row">
              <input type="hidden" name="sessionId" value={searchParams.sessionId} />
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="articleId" value={selectedId ?? ''} />
              <Button>Approve review</Button>
            </form>
          ) : null}
          {canPublish && session?.status === 'approved' ? (
            <form action={publishAction} className="form-row">
              <input type="hidden" name="sessionId" value={searchParams.sessionId} />
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="articleId" value={selectedId ?? ''} />
              <Button variant="primary">Publish</Button>
            </form>
          ) : null}
        </>
      ) : null}
    </PageMain>
  );
}
