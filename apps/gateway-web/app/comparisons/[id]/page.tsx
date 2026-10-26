import { notFound } from 'next/navigation';
import { getCuratedComparison, getStructuredSnapshot } from '../../../lib/migration-api';
import { getReaderOutline, getVersion, type OrderedEntry, type OrderedNode } from '../../../lib/api';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { migrationUi } from '../../../lib/migration-messages';
import { CollectionPage } from '../../components/layout/templates';
import { Grid } from '../../components/layout/Layout';
import { PageHeader, Pager } from '../../components/ui';
import { OrderedContentTree } from '../../components/ConstitutionText';
import { T } from '../../components/TranslationProvider';
import { FormattedDate } from '../../../lib/format-date';
import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { comparisonAction } from '../actions';

function findPassage(roots: OrderedNode[], logicalId: string): OrderedEntry | undefined {
  for (const node of roots) {
    if (node.logicalId === logicalId) return { type: 'child', node };
    for (const entry of node.content) {
      if (entry.logicalId === logicalId) return entry;
      if (entry.node) { const found = findPassage([entry.node], logicalId); if (found) return found; }
    }
  }
}
export default async function CuratedComparisonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ topic?: string; columns?: string | string[]; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const staff = user?.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role));
  const comparison = await getCuratedComparison(id, staff ? await requireSessionBearer() : undefined);
  if (!comparison) notFound();
  const { definition } = comparison;
  const topicIndex = Math.min(definition.topics.length - 1, Math.max(0, Number.parseInt(query.topic ?? '0', 10) || 0));
  const topic = definition.topics[topicIndex]!;
  const requested = (Array.isArray(query.columns) ? query.columns : query.columns?.split(','))?.map(Number);
  const selectedIndexes = definition.columns.map((_, index) => index).filter(index => !requested?.length || requested.includes(index));
  const selected = selectedIndexes.length ? selectedIndexes : definition.columns.map((_, index) => index);
  const values = await Promise.all(selected.map(async index => {
    const column = definition.columns[index]!;
    const [snapshot, version, outline] = await Promise.all([getStructuredSnapshot(column.versionId).catch(() => null), getVersion(column.versionId).catch(() => null), getReaderOutline(column.versionId).catch(() => null)]);
    return { index, column, snapshot, version, outline };
  }));
  const href = (next: number) => `/comparisons/${id}?${new URLSearchParams({ topic: String(next), columns: selected.join(',') })}`;
  return <CollectionPage width="content" header={<PageHeader title={definition.title} breadcrumbs={[{ href: '/comparisons', label: <T value={migrationUi.curatedComparisons} /> }, { label: definition.title }]} />}>
    <p>{definition.attribution} · <a href={definition.sourceUrl}><T value={migrationUi.source} /></a> · <a href={`/documents/${definition.sourceDocumentId}?revision=${definition.sourceDocumentRevision}`}><T value={migrationUi.downloadSource} /></a></p>
    {comparison.needsReview ? <p role="status"><T value={migrationUi.staleComparison} /></p> : null}
    {comparison.state !== 'published' ? <p role="status"><T value={migrationUi.privateComparison} /></p> : null}
    {query.error ? <p role="alert"><T value={migrationUi.comparisonActionFailed} /></p> : null}
    {staff && comparison.state === 'draft' && user?.roles.some(role => role === 'reviewer' || role === 'admin') ? <NavigatingActionForm action={comparisonAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="review" /><label htmlFor="comparison-reason"><T value={migrationUi.reviewReason} /></label><textarea id="comparison-reason" name="reason" required minLength={10} maxLength={2000} /><button type="submit"><T value={migrationUi.reviewComparison} /></button></NavigatingActionForm> : null}
    {staff && comparison.state === 'reviewed' && user?.roles.some(role => role === 'publisher' || role === 'admin') ? <NavigatingActionForm action={comparisonAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="publish" /><button type="submit"><T value={migrationUi.publishComparison} /></button></NavigatingActionForm> : null}
    <form action={`/comparisons/${id}`}><label htmlFor="comparison-topic"><T value={migrationUi.topic} /></label><select id="comparison-topic" name="topic" defaultValue={String(topicIndex)}>{definition.topics.map((row, index) => <option key={index} value={index}>{row.title}</option>)}</select><fieldset><legend><T value={migrationUi.comparedTexts} /></legend>{definition.columns.map((column, index) => <label key={column.constitutionId}><input type="checkbox" name="columns" value={index} defaultChecked={selected.includes(index)} /> {column.label}</label>)}</fieldset><button type="submit"><T value={migrationUi.showComparison} /></button></form>
    <h2>{topic.title}</h2>
    <Grid columns={2}>{values.map(({ index, column, snapshot, version, outline }) => {
      const references = topic.passages.filter(item => item.column === index);
      const entries = references.map(item => snapshot ? findPassage(snapshot.roots, item.logicalId) : undefined);
      const base = version?.countryCode ? `/countries/${version.countryCode}/versions/${column.versionId}` : version?.jurisdictionId ? `/jurisdictions/${version.jurisdictionId}/versions/${column.versionId}` : null;
      return <section key={column.constitutionId}><h3>{column.label}</h3>{version ? <p>{version.versionLabel} · <FormattedDate value={version.effectiveDate} />{base ? <> · <a href={base}><T value={migrationUi.fullText} /></a></> : null}</p> : null}
        {topic.missingColumns.includes(index) ? <p><T value={migrationUi.noCounterpart} /></p> : !snapshot || entries.some(entry => !entry) ? <p role="alert"><T value={migrationUi.passageUnavailable} /></p> : <OrderedContentTree entries={entries.filter((entry): entry is OrderedEntry => Boolean(entry))} idPrefix={`column-${index}-`} outline={outline ?? undefined} />}
      </section>;
    })}</Grid>
    <Pager previous={topicIndex > 0 ? { href: href(topicIndex - 1), label: <T value={migrationUi.previous} /> } : undefined} next={topicIndex + 1 < definition.topics.length ? { href: href(topicIndex + 1), label: <T value={migrationUi.next} /> } : undefined} />
  </CollectionPage>;
}
