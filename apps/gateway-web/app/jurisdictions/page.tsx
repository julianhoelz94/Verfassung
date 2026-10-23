import { CollectionPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { T } from '../components/TranslationProvider';
import { listJurisdictions } from '../../lib/migration-api';
import { migrationUi } from '../../lib/migration-messages';
import { ServiceUnavailable } from '../components/StatusMessage';
import { ui } from '../../lib/messages';

export default async function JurisdictionsPage() {
  const jurisdictions = await listJurisdictions().catch(() => null);
  return <CollectionPage width="content" header={<PageHeader title={<T value={migrationUi.jurisdictions} />} />}>
    {jurisdictions ? <ul>{jurisdictions.map(item => <li key={item.id}>
      <a href={`/jurisdictions/${item.id}`}>{item.name}</a>{item.historical ? <> · <T value={migrationUi.historical} /></> : null}
    </li>)}</ul> : <ServiceUnavailable service={ui.services.catalog} retryHref="/jurisdictions" />}
  </CollectionPage>;
}
