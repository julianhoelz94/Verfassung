import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { message } from '../../../../../lib/messages';
import { currentLocale } from '../../../../../lib/server-locale';
import { listAllSessions, type EditSessionSummary } from '../../../../../lib/editor-api';
import { Stack } from '../../../../components/layout/Layout';
import surfaceStyles from '../../../../components/surfaces.module.css';

type SessionWithVersion = { session: EditSessionSummary; versionLabel: string };

function workType(kind: EditSessionSummary['hopKind']) {
  return kind === 'legal' ? ui.remainingStatus.nextLegalChange : ui.remainingStatus.transcriptionCorrection;
}

function sessionHref(session: EditSessionSummary): string {
  return `/editor?sessionId=${encodeURIComponent(session.id)}&versionId=${encodeURIComponent(session.versionId)}`;
}

function lastEdit(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
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
  const locale = await currentLocale();
  let unavailable = false;
  try {
    sessions = await constitutionSessions(versions);
  } catch {
    unavailable = true;
  }
  const open = sessions.filter(({ session }) => session.status === 'open');
  const waiting = sessions.filter(({ session }) => session.status === 'reviewing' || session.status === 'approved');

  return <section id="editor-entry" className={["card editor-entry", surfaceStyles.card].join(' ')} aria-labelledby="editor-entry-title">
    <h2 id="editor-entry-title"><T value={ui.countries.code.versions.versionid.editorentry.editThisConstitution} /></h2>
    {unavailable ? <p role="status"><T value={ui.countries.code.versions.versionid.editorentry.editSessionsAreTemporarilyUnavailableTryAgain} /></p> : <>
      <section aria-labelledby="existing-sessions-title">
        <h3 id="existing-sessions-title"><T value={ui.countries.code.versions.versionid.editorentry.existingSessions} /></h3>
        {open.length ? <ul className="editor-entry-list">{open.map(({ session, versionLabel }) => <li key={session.id}>
          <span>{versionLabel} · <T value={workType(session.hopKind)} /> <T value={ui.countries.code.versions.versionid.editorentry.lastEdited} />{" "}{lastEdit(session.updatedAt, locale)}</span>
          <a className="btn btn-sm" href={sessionHref(session)}><T value={ui.countries.code.versions.versionid.editorentry.continueEditing} /></a>
        </li>)}</ul> : <p className="muted"><T value={ui.countries.code.versions.versionid.editorentry.youHaveNoOpenSessionsForThis} /></p>}
        {waiting.length ? <div className="editor-entry-waiting"><h4><T value={ui.countries.code.versions.versionid.editorentry.inReviewOrApproved} /></h4><ul>{waiting.map(({ session, versionLabel }) => <li key={session.id}>
          {versionLabel} · <T value={workType(session.hopKind)} /> · <T value={session.status === 'reviewing' ? ui.remainingStatus.reviewing : ui.remainingStatus.approved} />
          {session.status === 'reviewing' && canReview || session.status === 'approved' && canPublish ? <> · <a href={sessionHref(session)}><T value={ui.countries.code.versions.versionid.editorentry.open} />{" "}<T value={session.status === 'reviewing' ? ui.remainingStatus.review : ui.remainingStatus.publish} /> <T value={ui.countries.code.versions.versionid.editorentry.view} /></a></> : null}
        </li>)}</ul></div> : null}
      </section>
      <section aria-labelledby="new-session-title">
        <h3 id="new-session-title"><T value={ui.countries.code.versions.versionid.editorentry.startANewSession} /></h3>
        <p className="muted"><T value={ui.countries.code.versions.versionid.editorentry.sourceVersion} />{" "}{viewedVersionLabel}</p>
        {([['legal', ui.remainingStatus.recordNextLegalChange, allowLegalStart], ['editorial_correction', ui.remainingStatus.correctThisText, true]] as const).map(([kind, label, allowed]) => {
          if (!allowed) return null;
          const existing = sessions.find(({ session }) => session.versionId === viewedVersionId && session.hopKind === kind);
          if (existing) return <p key={kind}><T value={label} />: {existing.session.status === 'open' ? <a href={sessionHref(existing.session)}><T value={ui.countries.code.versions.versionid.editorentry.continueYourOpenSession} /></a> : <><T value={ui.remainingStatus.already} /> {message(locale, existing.session.status === 'reviewing' ? ui.remainingStatus.reviewing : ui.remainingStatus.approved)}. <T value={ui.remainingStatus.openWorkflowAbove} /></>}</p>;
          return <Stack as="form" key={kind} action="/editor/command" method="post">
            <input type="hidden" name="command" value="open" />
            <input type="hidden" name="versionId" value={viewedVersionId} />
            <input type="hidden" name="hopKind" value={kind} />
            <button className="btn" type="submit"><T value={label} /></button>
          </Stack>;
        })}
      </section>
    </>}
  </section>;
}
