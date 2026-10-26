import { CollectionPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { T } from '../components/TranslationProvider';
import { migrationUi } from '../../lib/migration-messages';
import { LegacyResolver } from './LegacyResolver';

export default async function LegacyPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  return <CollectionPage width="content" header={<PageHeader title={<T value={migrationUi.legacyLinks} />} />}>
    <LegacyResolver initialUrl={url ?? ''} canonicalOrigin={process.env.PUBLIC_BASE_URL ?? 'http://localhost'} />
  </CollectionPage>;
}
