import type { Amendment, VersionSummary } from '../../../lib/api';
import type { AmendmentRevision } from '../../../lib/amendment-editor-api';
import { Badge, Button } from '../../components/ui';
import { confirmQuotesAction } from './actions';

type QuoteReviewPanelProps = {
  amendment: Amendment;
  publishedRevision: AmendmentRevision | null;
  versions: VersionSummary[];
  canConfirm: boolean;
};

function versionFor(id: string | null | undefined, versions: VersionSummary[]): VersionSummary | null {
  return id ? versions.find((version) => version.id === id) ?? null : null;
}

function liveVersionFor(version: VersionSummary | null, versions: VersionSummary[]): VersionSummary | null {
  if (!version) return null;
  const liveId = version.currentVersionId ?? version.id;
  return versionFor(liveId, versions) ?? version;
}

function QuoteSide({ label, reviewed, live }: { label: string; reviewed: VersionSummary | null; live: VersionSummary | null }) {
  return (
    <section className="panel quote-review-side">
      <h2 className="panel-title">{label}</h2>
      <p><strong>Last reviewed</strong><br />{reviewed?.versionLabel ?? 'No quoted snapshot'}</p>
      <p><strong>Live tip</strong><br />{live?.versionLabel ?? 'No quoted snapshot'}</p>
      {reviewed && live && reviewed.id !== live.id ? <Badge tone="changed">Updated since review</Badge> : <Badge tone="added">Current</Badge>}
    </section>
  );
}

export function QuoteReviewPanel({ amendment, publishedRevision, versions, canConfirm }: QuoteReviewPanelProps) {
  const source = versionFor(publishedRevision?.sourceVersionId, versions);
  const target = versionFor(publishedRevision?.targetVersionId, versions);
  const sourceLive = liveVersionFor(source, versions);
  const targetLive = liveVersionFor(target, versions);
  return (
    <section aria-labelledby="quote-review-title">
      <h2 id="quote-review-title" className="section-title">Flagged record review</h2>
      <div className="quote-review-grid">
        <QuoteSide label="Source" reviewed={source} live={sourceLive} />
        <section className="panel quote-review-instrument">
          <h2 className="panel-title">Instrument</h2>
          <p><strong>{publishedRevision?.title ?? amendment.title}</strong></p>
          <p>{publishedRevision?.comment ?? amendment.comment ?? 'No reviewer comment.'}</p>
          <ul>
            {(publishedRevision?.changes ?? amendment.changes).map((change, index) => (
              <li key={`${change.articleNumber ?? 'change'}-${index}`}>
                {change.articleNumber ? `Article ${change.articleNumber}: ` : ''}{change.changeType}{change.note ? ` — ${change.note}` : ''}
              </li>
            ))}
          </ul>
          {canConfirm ? (
            <form action={confirmQuotesAction}>
              <input type="hidden" name="amendmentId" value={amendment.id} />
              <Button type="submit">Confirm live quotes and republish</Button>
            </form>
          ) : null}
        </section>
        <QuoteSide label="Target" reviewed={target} live={targetLive} />
      </div>
    </section>
  );
}
