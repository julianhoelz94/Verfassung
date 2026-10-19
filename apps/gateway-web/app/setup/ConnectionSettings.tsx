import { T } from '../components/TranslationProvider';
import { Card } from '../components/ui';
import type { SetupStatus } from '../../lib/deployment-setup';
import { setupMessages as m } from '../../lib/setup-messages';
import { TransportStatus } from './TransportStatus';

export function ConnectionSettings({ status }: { status: SetupStatus }) {
  return <Card><h2><T value={m.connection} /></h2>
    <p><a href={status.publicUrl}>{status.publicUrl}</a></p>
    <p><T value={status.tlsMode === 'local-http' ? m.local : status.tlsMode === 'external-proxy' ? m.proxy : m.secure} /></p>
    <TransportStatus />
    <p className="muted"><T value={m.connectionHint} /></p>
  </Card>;
}
