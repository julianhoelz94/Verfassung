import { notFound, redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { getMigrationRun, getImportFidelity, readCapturedSource } from '../../../../lib/migration-review';
import { getPreparedImportContent, getImportReviewDecisions } from '../../../../lib/ingestion-api';
import { getVersionSettings } from '../../../../lib/api';
import { migrationUi, migrationStateMessage } from '../../../../lib/migration-messages';
import { T } from '../../../components/TranslationProvider';
import { WorkspacePage } from '../../../components/layout/templates';
import { Grid } from '../../../components/layout/Layout';
import { PageHeader } from '../../../components/ui';
import { OrderedContentTree } from '../../../components/ConstitutionText';
import { NavigatingActionForm } from '../../../components/NavigatingActionForm';
import { prepareMigrationAction } from '../actions';

export default async function MigrationReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string; source?: string; state?: string; sourceOffset?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/admin/migrations/${id}`)}`);
  if (!user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) redirect('/');
  const authorization = await requireSessionBearer();
  const run = await getMigrationRun(id, authorization);
  if (!run) notFound();
  const selected = run.items.find(item => item.id === query.item) ?? run.items[0];
  const source = run.manifest.sources.find(item => item.sourceKey === query.source) ?? run.manifest.sources.find(item => item.sourceKey === selected?.sourceKey) ?? run.manifest.sources[0];
  const capture = source?.captureKey ? run.items.find(item => item.sourceKey === source.captureKey) : selected?.kind === 'document' ? selected : undefined;
  let original: string | null = null;
  let evidenceFailed = false;
  if (capture?.state === 'prepared' && source) {
    try { original = await readCapturedSource(capture, source, authorization); }
    catch { evidenceFailed = true; }
  }
  const prepared = selected?.result.versionId ? await getPreparedImportContent(selected.result.versionId, authorization) : null;
  const outline = selected?.result.versionId ? (await getVersionSettings(selected.result.versionId, authorization))?.outline : null;
  const fidelity = selected?.result.jobId && prepared ? await getImportFidelity(selected.result.jobId, authorization) : null;
  const decisions = selected?.result.jobId ? await getImportReviewDecisions(selected.result.jobId, authorization) : [];
  const offset = Math.max(0, Number.parseInt(query.sourceOffset ?? '0', 10) || 0);
  const nextSource = original != null && offset + 30000 < original.length ? offset + 30000 : null;
  const pageHref = (next: number) => `/admin/migrations/${id}?item=${selected?.id ?? ''}&source=${encodeURIComponent(source?.sourceKey ?? '')}&sourceOffset=${next}`;
  return <WorkspacePage width="content" header={<PageHeader title={run.manifest.title} breadcrumbs={[{ href: '/admin/migrations', label: <T value={migrationUi.migrations} /> }, { label: run.manifest.title }]} />}>
    {query.error ? <p role="alert"><T value={migrationUi.prepareFailed} /></p> : null}
    <p><T value={migrationUi.coverage} />: {run.coverage.prepared}/{run.coverage.staged} · <T value={migrationUi.sources} />: {run.coverage.sources} · <T value={migrationUi.unavailable} />: {run.coverage.unavailable} · <T value={migrationUi.excluded} />: {run.coverage.excluded}</p>
    <form action={`/admin/migrations/${id}`}><label htmlFor="migration-state"><T value={migrationUi.filter} /></label><select name="state" id="migration-state" defaultValue={query.state ?? ''}><option value="">—</option>{['staged', 'blocked', 'failed', 'prepared'].map(state => <option key={state} value={state}><T value={migrationStateMessage(state)} /></option>)}</select><button type="submit"><T value={migrationUi.filter} /></button></form>
    <ul>{run.items.filter(item => !query.state || item.state === query.state).map(item => <li key={item.id}>
      <a href={`/admin/migrations/${id}?item=${item.id}`}>{item.sourceKey}</a> · <T value={migrationStateMessage(item.state)} /> · <T value={migrationUi.attempts} />: {item.attempts}
      {item.error ? <p role="status">{item.error}</p> : null}
      {user.roles.some(role => role === 'editor' || role === 'admin') && item.state !== 'prepared' ? <NavigatingActionForm action={prepareMigrationAction}><input type="hidden" name="runId" value={id} /><input type="hidden" name="itemId" value={item.id} /><button type="submit"><T value={migrationUi.prepare} /></button></NavigatingActionForm> : null}
    </li>)}</ul>
    <details><summary><T value={migrationUi.sources} /></summary><ul>{run.manifest.sources.map(item => <li key={item.sourceKey}><a href={`/admin/migrations/${id}?item=${selected?.id ?? ''}&source=${encodeURIComponent(item.sourceKey)}`}>{item.sourceKey}</a> · <a href={item.url}>{item.url}</a>{item.reason ? <> · {item.reason}</> : null}{item.attribution ? <> · {item.attribution}</> : null}</li>)}</ul></details>
    {selected?.result.jobId ? <p><a href={`/editor?importJobId=${selected.result.jobId}`}><T value={migrationUi.openReview} /></a></p> : null}
    {selected?.result.documentId ? <p><a href={`/editor/documents/${selected.result.documentId}`}><T value={migrationUi.openDocument} /></a></p> : null}
    {selected?.result.amendmentId ? <p><a href={`/editor/amendments/${selected.result.amendmentId}`}><T value={migrationUi.openReview} /></a></p> : null}
    {fidelity ? <section><h2><T value={migrationUi.fidelity} /></h2>{fidelity.fidelity.length ? <ul>{fidelity.fidelity.map((item, index) => <li key={index}>{item.path}: {item.reason}</li>)}</ul> : <p><T value={migrationUi.fidelityPassed} /></p>}{!fidelity.fidelityComplete ? <p role="alert"><T value={migrationUi.moreMismatches} /></p> : null}</section> : null}
    {decisions.length ? <section><h2><T value={migrationUi.decisions} /></h2><ul>{decisions.map(item => <li key={item.id}>{item.reason}</li>)}</ul></section> : null}
    <Grid columns={2}>
      <section><h2><T value={migrationUi.source} /></h2>{capture?.result.documentId && capture.result.revision ? <p><a href={`/documents/${capture.result.documentId}?revision=${capture.result.revision}`}><T value={migrationUi.downloadSource} /></a></p> : null}
        {original != null ? <><p>{offset + 1}–{Math.min(offset + 30000, original.length)}/{original.length}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{original.slice(offset, offset + 30000)}</pre><nav>{offset > 0 ? <a href={pageHref(Math.max(0, offset - 30000))}>← <T value={migrationUi.previous} /></a> : null}{nextSource != null ? <a href={pageHref(nextSource)}><T value={migrationUi.next} /> →</a> : null}</nav></> : <p role={evidenceFailed ? 'alert' : 'status'}><T value={evidenceFailed ? migrationUi.sourceInvalid : migrationUi.missingSource} /></p>}
      </section>
      <section><h2><T value={migrationUi.preparedText} /></h2>{prepared ? <OrderedContentTree entries={prepared.roots.map(node => ({ type: 'child', node }))} outline={outline ?? undefined} /> : <p><T value={migrationUi.notPrepared} /></p>}</section>
    </Grid>
  </WorkspacePage>;
}
