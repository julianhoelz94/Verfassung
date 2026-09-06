import type { VersionSummary } from '../../lib/api';
import { httpUrl, provenanceLabel, verificationLabel } from '../../lib/provenance';

export function Provenance({ version }: { version: VersionSummary }) {
  const sourceHref = httpUrl(version.sourceUrl);
  return (
    <aside className="provenance" aria-label="Source and trust">
      <dl className="provenance-list">
        <div>
          <dt>Language</dt>
          <dd>{version.languageCode}</dd>
        </div>
        <div>
          <dt>Effective</dt>
          <dd>{version.effectiveDate ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Gazette</dt>
          <dd>{version.gazetteReference ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {sourceHref ? (
              <a href={sourceHref} rel="noreferrer">
                {version.sourceUrl}
              </a>
            ) : (
              version.sourceUrl ?? 'Not recorded'
            )}
          </dd>
        </div>
        <div>
          <dt>Text kind</dt>
          <dd>
            {provenanceLabel(version.provenance)}
            {version.latestPublished ? <span className="tag">Latest published</span> : null}
          </dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{verificationLabel(version)}</dd>
        </div>
      </dl>
    </aside>
  );
}
