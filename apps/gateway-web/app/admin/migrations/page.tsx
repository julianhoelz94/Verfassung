import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { getMigrationRuns } from '../../../lib/migration-review';
import { migrationUi } from '../../../lib/migration-messages';
import { T } from '../../components/TranslationProvider';
import { CollectionPage } from '../../components/layout/templates';
import { PageHeader } from '../../components/ui';

export default async function MigrationRunsPage() {
  const user = await currentUser();
  if (!user) redirect('/login?returnTo=%2Fadmin%2Fmigrations');
  if (!user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) redirect('/');
  const runs = await getMigrationRuns(await requireSessionBearer());
  return <CollectionPage width="content" header={<PageHeader title={<T value={migrationUi.migrations} />} />}>
    <p><Link href="/admin/import"><T value={migrationUi.importQueue} /></Link></p>
    {runs?.length ? <ul>{runs.map(run => <li key={run.id}><a href={`/admin/migrations/${run.id}`}>{run.title}</a> · {run.coverage.prepared}/{run.coverage.staged}</li>)}</ul> : <p><T value={migrationUi.noRuns} /></p>}
  </CollectionPage>;
}
