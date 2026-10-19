'use client';

import { T, useLocale, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import type { VersionSummary } from '../../lib/api';
import { FormattedDate } from '../../lib/format-date';
import { httpUrl, provenanceLabel, verificationLabel } from '../../lib/provenance';
import { Badge } from './ui';

export function Provenance({
  version,
  labelSuffix,
}: {
  version: VersionSummary;
  labelSuffix?: string;
}) {
  const locale = useLocale();
  const t = useTranslation();
  const sourceHref = httpUrl(version.sourceUrl);
  return (
    <aside className="provenance" aria-label={`${t(ui.remainingStatus.sourceAndTrust)}${labelSuffix ? ` · ${labelSuffix}` : ''}`}>
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
          <dd>{version.gazetteReference ?? <T value={ui.remainingStatus.notRecorded} />}</dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.source} /></dt>
          <dd>
            {sourceHref ? (
              <a href={sourceHref} rel="noreferrer">
                {version.sourceUrl}
              </a>
            ) : (
              version.sourceUrl ?? <T value={ui.remainingStatus.notRecorded} />
            )}
          </dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.textKind} /></dt>
          <dd>
            {provenanceLabel(version.provenance, locale)}
            {version.latestPublished ? <Badge tone="accent"><T value={ui.components.provenance.latestPublished} /></Badge> : null}
          </dd>
        </div>
        <div>
          <dt><T value={ui.components.provenance.verification} /></dt>
          <dd>{verificationLabel(version, locale)}</dd>
        </div>
      </dl>
    </aside>
  );
}
