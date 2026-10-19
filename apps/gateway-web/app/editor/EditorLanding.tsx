import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { message as localize } from '../../lib/messages';
import type { Locale } from '../../lib/locale';
import { currentLocale } from '../../lib/server-locale';
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

function workType(kind: EditSessionSummary['hopKind']) {
  return kind === 'legal' ? ui.remainingStatus.nextLegalChange : ui.remainingStatus.transcriptionCorrection;
}

function lastEdit(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

async function sessionRows(sessions: EditSessionSummary[], locale: Locale): Promise<SessionRow[]> {
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
      country: owner?.country.name ?? version?.countryCode ?? localize(locale, ui.remainingStatus.countryUnavailable),
      constitution: owner?.constitution.title ?? localize(locale, ui.remainingStatus.constitutionUnavailable),
      version: summary?.versionLabel ?? version?.versionLabel ?? localize(locale, ui.remainingStatus.versionUnavailable),
    };
  }));
}

export async function EditorLanding({ email, roles, status, error }: { email: string; roles: string[]; status?: string; error?: string }) {
  const locale = await currentLocale();
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
    rows = await sessionRows(sessions, locale);
  } catch {
    unavailable = true;
  }
  rows.sort((a, b) => a.country.localeCompare(b.country) || a.constitution.localeCompare(b.constitution) || b.session.updatedAt.localeCompare(a.session.updatedAt));
  const countries = [...new Set(rows.map((row) => row.country))];
  const heading = localize(locale, queue === 'reviewing' ? ui.nav.reviewQueue : queue === 'approved' ? ui.nav.readyToPublish : ui.editor.editorlanding.myOpenSessions);
  const message = editorErrorMessage(error);

  return <PageMain className="wide">
    <PageHeader title={<T value={ui.attrs.editorEditorlandingPageHeaderTitleEditor} />} eyebrow={heading} meta={`${localize(locale, ui.remainingStatus.signedInAs)} ${email}.`} />
    <h2 className="section-title">{heading}</h2>
    {message ? <Alert tone="error">{message}</Alert> : null}
    {unavailable ? <Alert tone="error"><T value={ui.editor.editorlanding.editSessionsAreTemporarilyUnavailableTryAgain} /></Alert> : rows.length === 0 ?
      <p className="muted">{queue ? <T value={queue === 'reviewing' ? ui.editorDynamic.noReviewSessions : ui.editorDynamic.noPublishSessions} /> : <><T value={ui.editor.editorlanding.noOpenSessions} />{" "}<Link href="/"><T value={ui.editor.editorlanding.browseCountries} /></Link> <T value={ui.editor.editorlanding.andChooseAConstitutionToStartEditing} /></>}</p> :
      countries.map((country) => <section key={country} className="editor-session-country">
        <h2>{country}</h2>
        {[...new Set(rows.filter((row) => row.country === country).map((row) => row.constitution))].map((constitution) =>
          <section key={constitution} className="editor-session-constitution">
            <h3>{constitution}</h3>
            <ul className="editor-session-list">{rows.filter((row) => row.country === country && row.constitution === constitution).map(({ session, version }) =>
              <li key={session.id}>
                <div><strong>{version}</strong><span><T value={workType(session.hopKind)} /> <T value={ui.editor.editorlanding.lastEdited} />{" "}{lastEdit(session.updatedAt, locale)}</span></div>
                <a className="btn btn-sm" href={sessionHref(session)}><T value={queue ? queue === 'reviewing' ? ui.editorDynamic.openReview : ui.editorDynamic.openPublishView : ui.editorDynamic.continueEditing} /></a>
              </li>)}</ul>
          </section>)}
      </section>)}
    {queue && canEdit ? <p><a href="/editor"><T value={ui.editor.editorlanding.myOpenSessions} /></a></p> : null}
  </PageMain>;
}
