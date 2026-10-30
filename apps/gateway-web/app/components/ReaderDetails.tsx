import type { ReactNode } from 'react';
import type { ConstitutionSummary, SourceEvidence, VersionDetail, VersionSummary } from '../../lib/api';
import { readerUi as copy } from '../../lib/reader-messages';
import { lifecycleStatusMessage } from '../../lib/lifecycle-label';
import { provenanceLabel, verificationLabel, httpUrl } from '../../lib/provenance';
import type { Locale } from '../../lib/locale';
import { T } from './TranslationProvider';
import { FormattedDate } from '../../lib/format-date';
import { SourceEvidenceNotice } from './SourceEvidenceNotice';

export function ReaderDetails({ constitution, jurisdictionName, version, snapshot, sourceEvidence, canEditSource, locale, children }: {
  constitution: ConstitutionSummary; jurisdictionName: string; version: VersionSummary; snapshot: VersionDetail;
  sourceEvidence?: SourceEvidence | null; canEditSource: boolean; locale: Locale; children?: ReactNode;
}) {
  const source = httpUrl(version.sourceUrl);
  return <><h2><T value={copy.details} /></h2><h3><T value={copy.constitution} /></h3><dl>
    <dt><T value={copy.title} /></dt><dd>{constitution.title}</dd>
    <dt><T value={copy.jurisdiction} /></dt><dd>{jurisdictionName}</dd>
    <dt><T value={copy.status} /></dt><dd><T value={lifecycleStatusMessage(constitution.lifecycleStatus)} /></dd>
  </dl><h3><T value={copy.textRead} /></h3><dl>
    <dt><T value={copy.publication} /></dt><dd>{version.versionLabel}{version.effectiveDate ? <> · <FormattedDate value={version.effectiveDate} /></> : null}</dd>
    <dt><T value={copy.snapshot} /></dt><dd><code>{snapshot.id}</code></dd>
    <dt><T value={copy.language} /></dt><dd>{snapshot.languageCode}</dd>
    <dt><T value={copy.verification} /></dt><dd>{verificationLabel(version, locale)}</dd>
    <dt><T value={copy.provenance} /></dt><dd>{provenanceLabel(version.provenance, locale)}</dd>
    {version.gazetteReference ? <><dt><T value={copy.source} /></dt><dd>{version.gazetteReference}</dd></> : null}
  </dl><h3><T value={copy.source} /></h3>
    {source ? <p><a href={source} rel="noreferrer">{source}</a></p> : null}
    <SourceEvidenceNotice headingLevel="none" evidence={sourceEvidence} versionId={snapshot.id} canEdit={canEditSource} />
    {children ? <><h3><T value={copy.related} /></h3>{children}</> : null}
  </>;
}
