import { T, ui } from './TranslationProvider';
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
          <dt><T value={ui.components.provenance.language} /></dt>
          <dd>{version.languageCode}</dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.effective} /></dt>
          <dd>
            <FormattedDate value={version.effectiveDate} />
          </dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.gazette} /></dt>
          <dd>{version.gazetteReference ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.source} /></dt>
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
          <dt><T value={ui.components.provenance.textKind} /></dt>
          <dd>
            {provenanceLabel(version.provenance)}
            {version.latestPublished ? <Badge tone="accent"><T value={ui.components.provenance.latestPublished} /></Badge> : null}
          </dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.verification} /></dt>
          <dd>{verificationLabel(version)}</dd>
        </div>
      </dl>
    </aside>
  );
}
