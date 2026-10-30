import { BookOpen, GitCompareArrows, History, Info } from 'lucide-react';
import type { ConstitutionSummary } from '../../lib/api';
import { constitutionHref, constitutionReading, type ConstitutionOwner } from '../../lib/country-directory';
import { directoryUi } from '../../lib/country-directory-messages';
import { lifecycleStatusMessage } from '../../lib/lifecycle-label';
import { ui } from '../../lib/messages';
import { snapshotVersionId } from '../../lib/reading';
import { orderVersions } from '../../lib/compare';
import { FormattedDate } from '../../lib/format-date';
import { reviewUi } from '../../lib/ui-review-messages';
import { CompareForm } from '../countries/[code]/CompareForm';
import { T } from './TranslationProvider';
import styles from './CountryDirectory.module.css';

export function ConstitutionEntry({ constitution, owner, headingLevel = 3, editorial = false, publisher = false }: {
  constitution: ConstitutionSummary;
  owner: ConstitutionOwner;
  headingLevel?: 3 | 4 | 5;
  editorial?: boolean;
  publisher?: boolean;
}) {
  const { versions, latest, latestSnapshotId } = constitutionReading(constitution);
  const ordered = orderVersions(versions);
  const Heading = headingLevel === 5 ? 'h5' : headingLevel === 4 ? 'h4' : 'h3';
  const id = `constitution-${constitution.id}`;
  const canCompare = ordered.length >= 2;
  const correctionContext = owner.countryCode ? `?code=${encodeURIComponent(owner.countryCode)}` : '';
  const canEdit = editorial && Boolean(owner.countryCode);
  const canRecordLifecycle = publisher && Boolean(owner.countryCode);
  return <article className={styles.entry} aria-labelledby={`${id}-title`} id={id}>
    <Heading className={styles.title} id={`${id}-title`}><a href={constitutionHref(owner, constitution.id)}>{constitution.title}</a></Heading>
    <p className={styles.meta}><span>{owner.name}</span>{constitution.interim ? <span><T value={ui.lifecycle.interimConstitution} /></span> : null}<span><T value={lifecycleStatusMessage(constitution.lifecycleStatus)} /></span></p>
    <div className={`chip-row ${styles.versions}`}>
      <span className={styles.versionLabel}><T value={directoryUi.availableVersions} /></span>
      {ordered.map(version => <a key={version.id} className={[styles.version, version.id === latest?.id ? styles.latestVersion : ''].join(' ')} href={`${owner.href}/versions/${snapshotVersionId(version)}`}>{version.versionLabel}</a>)}
      {latest ? <span className={styles.latest}><T value={directoryUi.latestAvailable} /></span> : null}
    </div>
    <div className={styles.actions}>
      {latestSnapshotId ? <a className={styles.read} href={`${owner.href}/versions/${latestSnapshotId}`}><BookOpen aria-hidden="true" /><T value={directoryUi.read} /></a> : <button className={styles.read} disabled><BookOpen aria-hidden="true" /><T value={directoryUi.read} /></button>}
      {canCompare ? <details className={styles.disclosure}>
        <summary className={styles.tool}><GitCompareArrows aria-hidden="true" /><T value={ui.countries.code.page.compareVersions} /></summary>
        <div className={styles.panel}><CompareForm code={owner.countryCode ?? ''} actionHref={`${owner.href}/compare`} idPrefix={id} versions={ordered.map(version => ({ ...version, id: snapshotVersionId(version) }))} fromId={snapshotVersionId(ordered[ordered.length - 2])} toId={snapshotVersionId(ordered[ordered.length - 1])} variant="inline" /></div>
      </details> : <button className={styles.tool} disabled aria-describedby={`${id}-compare-note`}><GitCompareArrows aria-hidden="true" /><T value={ui.countries.code.page.compareVersions} /></button>}
      <details className={styles.disclosure}>
        <summary className={styles.tool}><History aria-hidden="true" /><T value={directoryUi.versionHistory} /> ({ordered.length})</summary>
        <div className={styles.panel}><ul className={styles.versionList}>{ordered.map(version => <li key={version.id}><span>{version.versionLabel}{version.effectiveDate ? <small><T value={directoryUi.effective} /> · <FormattedDate value={version.effectiveDate} /></small> : null}</span><a href={`${owner.href}/versions/${snapshotVersionId(version)}`}><T value={directoryUi.readVersion} /></a></li>)}</ul>{!ordered.length ? <p><T value={directoryUi.noVersions} /></p> : null}</div>
      </details>
      <a className={styles.tool} href={constitutionHref(owner, constitution.id)}><Info aria-hidden="true" /><T value={directoryUi.about} /></a>
    </div>
    {!canCompare ? <p className={styles.availability} id={`${id}-compare-note`}><T value={ordered.length ? directoryUi.compareUnavailable : directoryUi.noVersions} /></p> : null}
    {canEdit || canRecordLifecycle || constitution.contentOutline?.kinds.length ? <details className={styles.details}><summary><T value={directoryUi.editorial} /></summary>
      {constitution.contentOutline?.kinds.length ? <p><T value={ui.countries.code.page.structure} /> {constitution.contentOutline.kinds.map(kind => kind.displayLabel).join(' → ')}</p> : null}
      {canEdit ? <><p><a href={`/editor/wiki/constitution/${constitution.id}${correctionContext}`}><T value={ui.countries.code.page.editConstitutionPage} /></a></p><p><a href={`/editor/history?constitutionId=${encodeURIComponent(constitution.id)}`}><T value={reviewUi.textCorrections} /></a></p></> : null}
      {canRecordLifecycle ? <p><a href={`/editor/lifecycle/${constitution.id}${correctionContext}`}><T value={ui.countries.code.page.recordLifecycleEvent} /></a></p> : null}
    </details> : null}
  </article>;
}
