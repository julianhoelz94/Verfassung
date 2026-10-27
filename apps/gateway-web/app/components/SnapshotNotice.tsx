import { reviewUi } from '../../lib/ui-review-messages';
import { T } from './TranslationProvider';

/** Only deliberate links to an older snapshot need editorial context during reading. */
export function SnapshotNotice({ viewedId, currentId, code, jurisdictionId }: { viewedId: string; currentId: string; code?: string; jurisdictionId?: string }) {
  if (viewedId === currentId) return null;
  return <p className="snapshot-notice" role="note">
    <T value={reviewUi.archivedSnapshot} />{' '}
    <a href={jurisdictionId ? `/jurisdictions/${encodeURIComponent(jurisdictionId)}/versions/${encodeURIComponent(currentId)}` : `/countries/${encodeURIComponent(code ?? '')}/versions/${encodeURIComponent(currentId)}`}><T value={reviewUi.readCurrentText} /></a>
  </p>;
}
