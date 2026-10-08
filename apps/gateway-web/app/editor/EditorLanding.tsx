import Link from 'next/link';
import { getCountry, getVersion, listCountries, type CountryDetail } from '../../lib/api';
import { editorErrorMessage, listAllSessions, type EditSessionSummary } from '../../lib/editor-api';
import { PageMain } from '../components/PageMain';
import { Alert, PageHeader } from '../components/ui';

type SessionRow = {
  session: EditSessionSummary;
  country: string;
  constitution: string;
  version: string;
};

function sessionHref(session: EditSessionSummary): string {
  return `/editor?sessionId=${encodeURIComponent(session.id)}&versionId=${encodeURIComponent(session.versionId)}`;
}

function workType(kind: EditSessionSummary['hopKind']): string {
  return kind === 'legal' ? 'Next legal change' : 'Transcription correction';
}

function lastEdit(iso: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));
}

async function sessionRows(sessions: EditSessionSummary[]): Promise<SessionRow[]> {
  if (sessions.length === 0) return [];
  const countries = await listCountries();
  const details = (await Promise.all((countries ?? []).map((item) => getCountry(item.isoCode))))
    .filter((country): country is CountryDetail => country != null);
  const ownership = details.flatMap((country) => country.constitutions.map((constitution) => ({ country, constitution })));
  return Promise.all(sessions.map(async (session) => {
    const known = ownership
      .find(({ constitution }) => constitution.versions.some((version) => version.id === session.versionId || version.currentVersionId === session.versionId));
    const version = known ? null : await getVersion(session.versionId).catch(() => null);
    const owner = known ?? ownership
      .find(({ constitution }) => constitution.id === version?.constitutionId);
    const summary = owner?.constitution.versions.find((item) => item.id === session.versionId || item.currentVersionId === session.versionId);
    return {
      session,
      country: owner?.country.name ?? version?.countryCode ?? 'Country unavailable',
      constitution: owner?.constitution.title ?? 'Constitution unavailable',
      version: summary?.versionLabel ?? version?.versionLabel ?? 'Version unavailable',
    };
  }));
}

export async function EditorLanding({ email, roles, status, error }: { email: string; roles: string[]; status?: string; error?: string }) {
  const canEdit = roles.includes('editor') || roles.includes('admin');
  const canReview = roles.includes('reviewer') || roles.includes('admin');
  const canPublish = roles.includes('publisher') || roles.includes('admin');
  const queue = status === 'reviewing' && canReview ? 'reviewing' : status === 'approved' && canPublish ? 'approved' :
    !canEdit && canReview ? 'reviewing' : !canEdit && canPublish ? 'approved' : null;
  let sessions: EditSessionSummary[] = [];
  let rows: SessionRow[] = [];
  let unavailable = false;
  try {
    sessions = await listAllSessions(queue ? { status: queue } : { openedBy: 'me', status: 'open' });
    rows = await sessionRows(sessions);
  } catch {
    unavailable = true;
  }
  rows.sort((a, b) => a.country.localeCompare(b.country) || a.constitution.localeCompare(b.constitution) || b.session.updatedAt.localeCompare(a.session.updatedAt));
  const countries = [...new Set(rows.map((row) => row.country))];
  const heading = queue === 'reviewing' ? 'Review queue' : queue === 'approved' ? 'Ready to publish' : 'My open sessions';
  const message = editorErrorMessage(error);

  return <PageMain className="wide">
    <PageHeader title="Editor" eyebrow={heading} meta={`Signed in as ${email}.`} />
    <h2 className="section-title">{heading}</h2>
    {message ? <Alert tone="error">{message}</Alert> : null}
    {unavailable ? <Alert tone="error">Edit sessions are temporarily unavailable. Try again.</Alert> : rows.length === 0 ?
      <p className="muted">{queue ? `No sessions are ${queue === 'reviewing' ? 'waiting for review' : 'approved for publish'}.` : <>No open sessions. <Link href="/">Browse countries</Link> and choose a constitution to start editing.</>}</p> :
      countries.map((country) => <section key={country} className="editor-session-country">
        <h2>{country}</h2>
        {[...new Set(rows.filter((row) => row.country === country).map((row) => row.constitution))].map((constitution) =>
          <section key={constitution} className="editor-session-constitution">
            <h3>{constitution}</h3>
            <ul className="editor-session-list">{rows.filter((row) => row.country === country && row.constitution === constitution).map(({ session, version }) =>
              <li key={session.id}>
                <div><strong>{version}</strong><span>{workType(session.hopKind)} · Last edited {lastEdit(session.updatedAt)}</span></div>
                <a className="btn btn-sm" href={sessionHref(session)}>{queue ? queue === 'reviewing' ? 'Open review' : 'Open publish view' : 'Continue editing'}</a>
              </li>)}</ul>
          </section>)}
      </section>)}
    {queue && canEdit ? <p><a href="/editor">My open sessions</a></p> : null}
  </PageMain>;
}
