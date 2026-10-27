'use client';

import { useRef, useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SourceEvidence } from '../../lib/api';
import type { DraftPreview } from '../../lib/editor-api';
import { sourceEvidenceUi as copy, sourceDecisionUi } from '../../lib/source-evidence-messages';
import { ui } from '../../lib/messages';
import { sourceDescriptionText } from '../../lib/source-evidence';
import { SourceDescription } from '../components/SourceDescription';
import { WorkspacePage } from '../components/layout/templates';
import { Stack, Inline, Grid } from '../components/layout/Layout';
import { Alert, Button, PageHeader, WorkflowSteps } from '../components/ui';
import { T, useLocale, useTranslation } from '../components/TranslationProvider';

function EvidenceComparison({ before, after }: { before: SourceEvidence | null; after: SourceEvidence }) {
  return <Grid columns={2}>
    <section><h3><T value={copy.before} /></h3><SourceDescription evidence={before} /></section>
    <section><h3><T value={copy.after} /></h3><SourceDescription evidence={after} /></section>
  </Grid>;
}

type Props = {
  preview: DraftPreview;
  publishedEvidence: SourceEvidence | null;
  userId: string;
  roles: string[];
  sourceHref?: string;
  publishedHref?: string;
  error?: string | null;
};

export function SourceEvidenceWorkspace({ preview, publishedEvidence, userId, roles, sourceHref, publishedHref, error }: Props) {
  const router = useRouter();
  const t = useTranslation();
  const locale = useLocale();
  const latest = preview.sourceEvidenceRevisions?.[0];
  const original = latest ? latest.original : publishedEvidence;
  const [description, setDescription] = useState(() => sourceDescriptionText(latest?.evidence ?? publishedEvidence));
  const [reason, setReason] = useState(latest?.reason ?? '');
  const [expectedRevision, setExpectedRevision] = useState(latest?.revision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty && !leaving.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const session = preview.session;
  const admin = roles.includes('admin');
  const canEdit = (admin || roles.includes('editor')) && session.actorId === userId && session.status === 'open';
  const canReview = (admin || roles.includes('reviewer')) && (admin || session.actorId !== userId) && session.status === 'reviewing';
  const canPublish = (admin || roles.includes('publisher')) && session.status === 'approved';
  const fields = <>
    <input type="hidden" name="sessionId" value={session.id} />
    <input type="hidden" name="versionId" value={session.versionId} />
    <input type="hidden" name="scope" value="sources" />
    <input type="hidden" name="hopKind" value="editorial_correction" />
    <input type="hidden" name="sourceEvidenceRevision" value={expectedRevision || ''} />
  </>;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      const response = await fetch('/editor/command', { method: 'POST', body: new FormData(event.currentTarget), headers: { accept: 'application/json' } });
      const result = await response.json();
      if (!response.ok) {
        setSaveError(t(result.key === 'stale_source_evidence' ? copy.stale : result.key === 'source_evidence_invalid' ? copy.invalid : result.key === 'forbidden' ? ui.errors.forbidden : result.key === 'sign_in' ? ui.errors.signIn : copy.saveFailed));
        return;
      }
      setExpectedRevision(result.sourceEvidenceRevisions[0].revision);
      setDirty(false); setSaved(true);
      router.refresh();
    } catch {
      setSaveError(t(copy.saveFailed));
    } finally {
      setSaving(false);
    }
  }
  return <WorkspacePage width="content" header={<PageHeader
    title={<T value={copy.edit} />}
    breadcrumbs={[{ href: '/editor', label: <T value={ui.nav.editor} /> }, { label: session.id.slice(0, 8) }]}
    meta={<WorkflowSteps status={session.status} />}
    actions={(publishedHref || sourceHref) ? <a className="btn" href={publishedHref ?? sourceHref}><T value={publishedHref ? copy.published : copy.source} /></a> : null}
  />}>
    {error || saveError ? <Alert tone="error">{saveError ?? error}</Alert> : null}
    {saved ? <Alert tone="success"><T value={copy.saved} /></Alert> : null}
    <p><T value={copy.explanation} /></p>
    <Stack as="section" id="source-evidence" aria-label={t(copy.fieldsGroup)}>
      <h2><T value={copy.fieldsGroup} /></h2>
      {canEdit ? <Stack as="form" id="source-evidence-form" action="/editor/command" method="post" onSubmit={save} onChange={() => { setDirty(true); setSaved(false); }}>
        {fields}
        <input type="hidden" name="command" value="source-evidence" />
        <input type="hidden" name="expectedRevision" value={expectedRevision} />
        <label htmlFor="source-description"><T value={copy.description} /></label>
        <p id="source-format-help" className="muted"><T value={copy.formatHelp} /></p>
        <textarea id="source-description" name="description" value={description} maxLength={50000} rows={12}
          aria-describedby="source-format-help" onChange={event => setDescription(event.target.value)} />
        <details><summary><T value={copy.preview} /></summary>
          <SourceDescription evidence={{ description, datePrecision: 'unknown' }} />
        </details>
      </Stack> : null}
      {latest ? <EvidenceComparison before={original} after={latest.evidence} /> : <p><T value={copy.noDraft} /></p>}
    </Stack>
    <Stack as="section" id="source-change-reason" aria-label={t(copy.changeNote)}>
      <h2 id="source-reason-heading"><T value={copy.reason} /></h2>
      <p><T value={copy.reasonHelp} /></p>
      {canEdit ? <>
        <textarea id="source-reason" name="reason" form="source-evidence-form" aria-labelledby="source-reason-heading" value={reason} maxLength={4000} rows={3} required
          onChange={event => { setReason(event.target.value); setDirty(true); setSaved(false); }} />
        <Button form="source-evidence-form" disabled={saving || !dirty}><T value={copy.save} /></Button>
      </> : <p>{latest?.reason ?? t(copy.noDraft)}</p>}
    </Stack>
    <p><T value={copy.textReminder} /> <a href={`/editor?sessionId=${encodeURIComponent(session.id)}&scope=text`}><T value={copy.inspectText} /></a></p>
    <Inline>
      {canEdit && latest ? <form action="/editor/command" method="post" onSubmit={() => { leaving.current = true; }}>
        {fields}<input type="hidden" name="command" value="review" />
        <Button disabled={dirty || saving}><T value={copy.review} /></Button>
      </form> : null}
      {canReview ? <form action="/editor/command" method="post">{fields}<input type="hidden" name="command" value="approve" /><Button><T value={copy.approve} /></Button></form> : null}
      {canPublish ? <form action="/editor/command" method="post">{fields}<input type="hidden" name="command" value="publish" /><Button variant="primary"><T value={copy.publish} /></Button></form> : null}
    </Inline>
    {dirty ? <p role="status"><T value={copy.unsaved} /></p> : null}
    {canReview && latest ? <Stack as="form" action="/editor/command" method="post">
      {fields}<input type="hidden" name="command" value="source-evidence-changes" />
      <input type="hidden" name="expectedRevision" value={latest.revision} />
      <label htmlFor="source-review-reason"><T value={copy.reviewReason} /></label>
      <textarea id="source-review-reason" name="reason" maxLength={4000} required rows={3} />
      <Button><T value={copy.requestChanges} /></Button>
    </Stack> : null}
    <section aria-label={t(copy.history)}>
      <h2><T value={copy.history} /></h2>
      <ol>{(preview.sourceEvidenceRevisions ?? []).map(revision => <li key={revision.id}>
        <details><summary><T value={copy.revision} /> {revision.revision} · <time dateTime={revision.createdAt}>{date(revision.createdAt)}</time></summary>
          <p><T value={copy.author} />: {revision.actorEmail ?? revision.actorId}</p>
          <EvidenceComparison before={revision.original} after={revision.evidence} />
          <p><strong><T value={copy.reason} />:</strong> {revision.reason}</p>
        </details>
      </li>)}</ol>
      <ol>{(preview.sourceEvidenceDecisions ?? []).map(decision => <li key={decision.id}>
        <T value={sourceDecisionUi[decision.action]} /> · <T value={copy.revision} /> {decision.revision} · <time dateTime={decision.createdAt}>{date(decision.createdAt)}</time>
        <p><T value={copy.author} />: {decision.actorEmail ?? decision.actorId}</p>{decision.reason ? <p>{decision.reason}</p> : null}
      </li>)}</ol>
    </section>
  </WorkspacePage>;
}
