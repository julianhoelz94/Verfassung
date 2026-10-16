import { T, ui } from '../../../../components/TranslationProvider';
import { listAllSessions, type EditSessionSummary } from '../../../../../lib/editor-api';

type SessionWithVersion = { session: EditSessionSummary; versionLabel: string };

function workType(kind: EditSessionSummary['hopKind']): string {
  return kind === 'legal' ? 'Next legal change' : 'Transcription correction';
}

function sessionHref(session: EditSessionSummary): string {
  return `/editor?sessionId=${encodeURIComponent(session.id)}&versionId=${encodeURIComponent(session.versionId)}`;
}

function lastEdit(iso: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));
}

async function constitutionSessions(versions: { id: string; currentVersionId?: string | null; versionLabel: string }[]): Promise<SessionWithVersion[]> {
  const labels = new Map(versions.flatMap((version) => [version.id, version.currentVersionId]
    .filter((id): id is string => Boolean(id))
    .map((id) => [id, version.versionLabel] as const)));
  const sessions = await listAllSessions({ openedBy: 'me' });
  return sessions
    .filter((session) => ['open', 'reviewing', 'approved'].includes(session.status) && labels.has(session.versionId))
    .map((session) => ({ session, versionLabel: labels.get(session.versionId)! }))
    .sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt));
}

export async function EditorEntry({ versions, viewedVersionId, viewedVersionLabel, allowLegalStart, canReview, canPublish }: {
  versions: { id: string; currentVersionId?: string | null; versionLabel: string }[];
  viewedVersionId: string;
  viewedVersionLabel: string;
  allowLegalStart: boolean;
  canReview: boolean;
  canPublish: boolean;
}) {
  let sessions: SessionWithVersion[] = [];
  let unavailable = false;
  try {
    sessions = await constitutionSessions(versions);
  } catch {
    unavailable = true;
  }
  const open = sessions.filter(({ session }) => session.status === 'open');
  const waiting = sessions.filter(({ session }) => session.status === 'reviewing' || session.status === 'approved');

  return <section id="editor-entry" className="card editor-entry" aria-labelledby="editor-entry-title">
    <h2 id="editor-entry-title"><T value={ui.countries.code.versions.versionid.editorentry.editThisConstitution} /></h2>
    {unavailable ? <p role="status"><T value={ui.countries.code.versions.versionid.editorentry.editSessionsAreTemporarilyUnavailableTryAgain} /></p> : <>
      <section aria-labelledby="existing-sessions-title">
        <h3 id="existing-sessions-title"><T value={ui.countries.code.versions.versionid.editorentry.existingSessions} /></h3>
        {open.length ? <ul className="editor-entry-list">{open.map(({ session, versionLabel }) => <li key={session.id}>
          <span>{versionLabel} · {workType(session.hopKind)} <T value={ui.countries.code.versions.versionid.editorentry.lastEdited} />{" "}{lastEdit(session.updatedAt)}</span>
          <a className="btn btn-sm" href={sessionHref(session)}><T value={ui.countries.code.versions.versionid.editorentry.continueEditing} /></a>
        </li>)}</ul> : <p className="muted"><T value={ui.countries.code.versions.versionid.editorentry.youHaveNoOpenSessionsForThis} /></p>}
        {waiting.length ? <div className="editor-entry-waiting"><h4><T value={ui.countries.code.versions.versionid.editorentry.inReviewOrApproved} /></h4><ul>{waiting.map(({ session, versionLabel }) => <li key={session.id}>
          {versionLabel} · {workType(session.hopKind)} · {session.status}
          {session.status === 'reviewing' && canReview || session.status === 'approved' && canPublish ? <> · <a href={sessionHref(session)}><T value={ui.countries.code.versions.versionid.editorentry.open} />{" "}{session.status === 'reviewing' ? 'review' : 'publish'} <T value={ui.countries.code.versions.versionid.editorentry.view} /></a></> : null}
        </li>)}</ul></div> : null}
      </section>
      <section aria-labelledby="new-session-title">
        <h3 id="new-session-title"><T value={ui.countries.code.versions.versionid.editorentry.startANewSession} /></h3>
        <p className="muted"><T value={ui.countries.code.versions.versionid.editorentry.sourceVersion} />{" "}{viewedVersionLabel}</p>
        {([['legal', 'Record the next legal change', allowLegalStart], ['editorial_correction', 'Correct this text', true]] as const).map(([kind, label, allowed]) => {
          if (!allowed) return null;
          const existing = sessions.find(({ session }) => session.versionId === viewedVersionId && session.hopKind === kind);
          if (existing) return <p key={kind}>{label}: {existing.session.status === 'open' ? <a href={sessionHref(existing.session)}><T value={ui.countries.code.versions.versionid.editorentry.continueYourOpenSession} /></a> : `Already ${existing.session.status}. Open its workflow above when your role permits.`}</p>;
          return <form key={kind} action="/editor/command" method="post">
            <input type="hidden" name="command" value="open" />
            <input type="hidden" name="versionId" value={viewedVersionId} />
            <input type="hidden" name="hopKind" value={kind} />
            <button className="btn" type="submit">{label}</button>
          </form>;
        })}
      </section>
    </>}
  </section>;
}
