import { redirect } from 'next/navigation';
import { getArticle, getCountry, listArticles, listCountries, type ArticleSummary, type CountryDetail, type CountrySummary } from '../../lib/api';
import { currentUser } from '../../lib/session';
import { ArticleEditor } from './ArticleEditor';
import { openEditorAction, publishAction, reviewAction } from './actions';

type EditorPageProps = {
  searchParams: {
    versionId?: string;
    sessionId?: string;
    articleId?: string;
    saved?: string;
    reviewed?: string;
    published?: string;
  };
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  const canEdit = user.roles.includes('editor') || user.roles.includes('admin');
  if (!canEdit) {
    return (
      <main style={{ padding: 24 }}>
        <p>Signed in as {user.email}, but this account cannot edit.</p>
      </main>
    );
  }

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
  const versionId = searchParams.versionId ?? versions[0]?.id;
  const articles: ArticleSummary[] = versionId ? ((await listArticles(versionId)) ?? []) : [];
  const selectedId = searchParams.articleId ?? articles[0]?.id;
  const selected = selectedId ? await getArticle(selectedId) : null;

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Editor</h1>
      <p>Signed in as {user.email}.</p>
      {searchParams.saved ? <p>Draft saved.</p> : null}
      {searchParams.reviewed ? <p>Submitted for review (audit event recorded).</p> : null}
      {searchParams.published ? (
        <p>Publish recorded. Public content is not rewritten yet (feature flag / QLT-5).</p>
      ) : null}

      {versions.length > 0 ? (
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
      ) : (
        <p>No published versions available.</p>
      )}

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
          {selected && versionId && searchParams.sessionId ? (
            <ArticleEditor
              sessionId={searchParams.sessionId}
              versionId={versionId}
              articleId={selected.id}
              title={selected.title}
              body={selected.body}
            />
          ) : null}
          <form action={reviewAction} style={{ display: 'inline', marginRight: 12 }}>
            <input type="hidden" name="sessionId" value={searchParams.sessionId} />
            <input type="hidden" name="versionId" value={versionId} />
            <button type="submit">Submit for review</button>
          </form>
          <form action={publishAction} style={{ display: 'inline' }}>
            <input type="hidden" name="sessionId" value={searchParams.sessionId} />
            <input type="hidden" name="versionId" value={versionId} />
            <button type="submit">Publish</button>
          </form>
        </>
      ) : null}
    </main>
  );
}
