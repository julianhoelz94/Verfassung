import { redirect } from 'next/navigation';
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
      <main>
        <p>Signed in as {user.email}, but this account has no editorial role.</p>
      </main>
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
  const articles: ArticleSummary[] = versionId ? ((await listArticles(versionId)) ?? []) : [];
  const selectedId = searchParams.articleId ?? articles[0]?.id;
  const selected = selectedId ? await getArticle(selectedId) : null;
  const draft = selected
    ? preview?.drafts?.find((item) => item.articleId === selected.id)
    : undefined;

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Editor</h1>
      <p>
        Signed in as {user.email}. Roles: {user.roles.join(', ')}.
      </p>
      {searchParams.error ? <p role="alert">{searchParams.error}</p> : null}
      {searchParams.saved ? <p>Draft saved.</p> : null}
      {searchParams.reviewed ? <p>Submitted for review.</p> : null}
      {searchParams.approved ? <p>Review approved. A publisher can now publish.</p> : null}
      {searchParams.published ? <p>Published. Public article text for this version was updated.</p> : null}
      {session ? <p>Session {session.id} is {session.status}.</p> : null}

      {canEdit && versions.length > 0 ? (
        <form action={openEditorAction}>
          <label htmlFor="versionId">Version</label>{' '}
          <select id="versionId" name="versionId" defaultValue={versionId}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.constitutionTitle} {version.versionLabel}
              </option>
            ))}
          </select>{' '}
          <button type="submit">Open session</button>
        </form>
      ) : null}

      {canReview || canPublish ? (
        <form action={loadSessionAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="versionId" value={versionId ?? ''} />
          <label htmlFor="loadSessionId">Session id</label>{' '}
          <input id="loadSessionId" name="sessionId" defaultValue={searchParams.sessionId ?? ''} style={{ width: 320, padding: 8 }} />{' '}
          <button type="submit">Load session</button>
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
            <ArticleEditor
              sessionId={searchParams.sessionId}
              versionId={versionId}
              articleId={selected.id}
              title={draft?.title ?? selected.title}
              body={draft?.body ?? selected.body}
            />
          ) : null}
          {selected && (!canEdit || session?.status !== 'open') ? (
            <section>
              <h3>{draft?.title ?? selected.title}</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif' }}>
                {draft?.body ?? selected.body}
              </pre>
            </section>
          ) : null}
          {canEdit && session?.status === 'open' ? (
            <form action={reviewAction} style={{ display: 'inline', marginRight: 12 }}>
              <input type="hidden" name="sessionId" value={searchParams.sessionId} />
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="articleId" value={selectedId ?? ''} />
              <button type="submit">Submit for review</button>
            </form>
          ) : null}
          {canReview && session?.status === 'reviewing' ? (
            <form action={approveAction} style={{ display: 'inline', marginRight: 12 }}>
              <input type="hidden" name="sessionId" value={searchParams.sessionId} />
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="articleId" value={selectedId ?? ''} />
              <button type="submit">Approve review</button>
            </form>
          ) : null}
          {canPublish && session?.status === 'approved' ? (
            <form action={publishAction} style={{ display: 'inline' }}>
              <input type="hidden" name="sessionId" value={searchParams.sessionId} />
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="articleId" value={selectedId ?? ''} />
              <button type="submit">Publish</button>
            </form>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
