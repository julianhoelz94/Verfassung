import type { SourceEvidence } from '../../lib/api';
import { migrationUi } from '../../lib/migration-messages';
import { T } from './TranslationProvider';
import { sourceEvidenceUi } from '../../lib/source-evidence-messages';
import { SourceDescription } from './SourceDescription';

export function SourceEvidenceNotice({ evidence, versionId, canEdit = false, headingLevel = 'h2' }: { evidence?: SourceEvidence | null; versionId?: string; canEdit?: boolean; headingLevel?: 'h2' | 'h3' | 'none' }) {
  if (!evidence && !canEdit) return versionId ? <p><a href={`/versions/${versionId}/annotations`}><T value={migrationUi.annotations} /></a></p> : null;
  const Heading = headingLevel === 'none' ? null : headingLevel;
  return <aside role="note">
    {Heading ? <Heading><T value={migrationUi.source} /></Heading> : null}
    {evidence?.description != null ? <SourceDescription evidence={evidence} /> : <>
    {evidence?.dateWording ? <p><T value={migrationUi.sourceDate} />: {evidence.dateWording}</p> : null}
    {evidence?.coverage ? <p>{evidence.coverage}</p> : null}
    {evidence?.statusWording ? <p><T value={migrationUi.sourceStatus} />: {evidence.statusWording}</p> : null}
    {evidence?.attribution ? <p>{evidence.attribution}</p> : null}
    </>}
    <p><T value={migrationUi.archivalNotice} /></p>
    {versionId ? <p><a href={`/versions/${versionId}/annotations`}><T value={migrationUi.annotations} /></a></p> : null}
    {canEdit && versionId ? <form action="/editor/command" method="post">
      <input type="hidden" name="command" value="open-sources" />
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="scope" value="sources" />
      <button className="btn" type="submit"><T value={sourceEvidenceUi.edit} /></button>
    </form> : null}
  </aside>;
}
