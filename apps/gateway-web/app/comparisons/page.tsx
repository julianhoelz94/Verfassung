import { CollectionPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { T } from '../components/TranslationProvider';
import { listCuratedComparisons } from '../../lib/migration-api';
import { migrationUi } from '../../lib/migration-messages';

export default async function ComparisonsPage() {
  const comparisons = await listCuratedComparisons();
  return <CollectionPage width="content" header={<PageHeader title={<T value={migrationUi.curatedComparisons} />} />}>
    {comparisons?.length ? <ul>{comparisons.map(item => <li key={item.id}><a href={`/comparisons/${item.id}`}>{item.title}</a></li>)}</ul> : <p><T value={migrationUi.noComparisons} /></p>}
  </CollectionPage>;
}
