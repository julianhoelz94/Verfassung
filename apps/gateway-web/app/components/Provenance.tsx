import type { VersionSummary } from '../../lib/api';
import { FormattedDate } from '../../lib/format-date';
import { httpUrl, provenanceLabel, verificationLabel } from '../../lib/provenance';
import { Badge } from './ui';

export function Provenance({
  version,
  label = 'Source and trust',
}: {
  version: VersionSummary;
  label?: string;
}) {
  const sourceHref = httpUrl(version.sourceUrl);
  return (
    <aside className="provenance" aria-label={label}>
      <dl className="provenance-list">
        <div>
          <dt>Language</dt>
          <dd>{version.languageCode}</dd>
        </div>
        <div>
          <dt>Effective</dt>
          <dd>
            <FormattedDate value={version.effectiveDate} />
          </dd>
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
            {version.latestPublished ? <Badge tone="accent">Latest published</Badge> : null}
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
