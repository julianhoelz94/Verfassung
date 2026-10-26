import type { SourceEvidence } from '../../lib/api';
import { migrationUi } from '../../lib/migration-messages';
import { T } from './TranslationProvider';

export function SourceEvidenceNotice({ evidence, versionId }: { evidence?: SourceEvidence | null; versionId?: string }) {
  if (!evidence) return versionId ? <p><a href={`/versions/${versionId}/annotations`}><T value={migrationUi.annotations} /></a></p> : null;
  return <aside role="note">
    <h2><T value={migrationUi.source} /></h2>
    {evidence.dateWording ? <p><T value={migrationUi.sourceDate} />: {evidence.dateWording}</p> : null}
    {evidence.coverage ? <p>{evidence.coverage}</p> : null}
    {evidence.statusWording ? <p><T value={migrationUi.sourceStatus} />: {evidence.statusWording}</p> : null}
    {evidence.attribution ? <p>{evidence.attribution}</p> : null}
    <p><T value={migrationUi.archivalNotice} /></p>
    {versionId ? <p><a href={`/versions/${versionId}/annotations`}><T value={migrationUi.annotations} /></a></p> : null}
  </aside>;
}
