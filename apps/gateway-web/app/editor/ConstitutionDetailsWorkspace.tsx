'use client';

import { Fragment, useEffect, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstitutionDetails } from '../../lib/constitution-metadata';
import { fetchWithTimeout } from '../../lib/fetch-with-timeout';
import { ui } from '../../lib/messages';
import { httpUrl } from '../../lib/provenance';
import { SourceDescription } from '../components/SourceDescription';
import { useTranslation } from '../components/TranslationProvider';
import { useDraftState } from './EditorDraftState';
import styles from './ConstitutionDetailsWorkspace.module.css';

type Props = { constitutionId: string; versionId: string; code?: string; canEdit: boolean; canManageStructure: boolean; canPublish: boolean };

export function ConstitutionDetailsWorkspace({ constitutionId, versionId, code, canEdit, canManageStructure, canPublish }: Props) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de }), router = useRouter();
  const { textDirty, detailsDirty } = useDraftState();
  const sessionDirty = textDirty || detailsDirty;
  const [data, setData] = useState<ConstitutionDetails | null>(null), [title, setTitle] = useState(''), [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [attempt, setAttempt] = useState(0);
  const dirty = Boolean(data && (title !== data.metadata.title || slug !== data.metadata.slug));
  const blocked = sessionDirty || dirty || saving;
  const endpoint = '/editor/metadata?' + new URLSearchParams({ constitutionId, versionId, ...(code ? { code } : {}) });
  useEffect(() => {
    const controller = new AbortController();
    void fetchWithTimeout(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('load_failed');
      const result = await response.json() as ConstitutionDetails;
      if (!controller.signal.aborted) { setData(result); setTitle(result.metadata.title); setSlug(result.metadata.slug); }
    }).catch(() => { if (!controller.signal.aborted) setError('load_failed'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) { if (blocked) event.preventDefault(); }
  const feedback = error === 'stale_metadata' ? copy('These details changed elsewhere. Your edits are still here. Reload the saved details before trying again.', 'Diese Angaben wurden inzwischen geändert. Deine Eingaben bleiben erhalten. Lade vor dem nächsten Versuch den gespeicherten Stand neu.')
    : error === 'slug_reserved' ? copy('This URL slug is already reserved. Choose another slug.', 'Dieser URL-Name ist bereits vergeben. Wähle einen anderen Namen.')
      : error ? copy('The details could not be loaded or saved. Try again.', 'Die Angaben konnten nicht geladen oder gespeichert werden. Versuche es erneut.') : '';
  async function save() {
    if (!data || !canEdit || sessionDirty || loading || saving || !dirty) return;
    setSaving(true); setSaved(false); setError('');
    try {
      const response = await fetchWithTimeout(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevisionId: data.metadata.revisionId, title, slug }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'save_failed'); return; }
      setData({ ...data, metadata: result }); setTitle(result.title); setSlug(result.slug); setSaved(true); router.refresh();
    } catch { setError('save_failed'); } finally { setSaving(false); }
  }
  const link = (href: string, label: string) => <a href={href} aria-disabled={blocked || undefined} onClick={guardNavigation}>{label}</a>;
  return <section className={styles.workspace} aria-label={copy('Constitution details', 'Verfassungsangaben')}>
    <h2>{copy('Details', 'Angaben')}</h2>
    {loading ? <p role="status">{copy('Loading details…', 'Angaben werden geladen…')}</p> : null}
    {textDirty ? <p role="status" className={styles.muted}>{copy('Save the text draft before changing these details or opening another workflow.', 'Speichere den Textentwurf, bevor du diese Angaben änderst oder einen anderen Ablauf öffnest.')}</p> : null}
    {!textDirty && detailsDirty ? <p role="status" className={styles.muted}>{copy('Save the publication details before changing these details or opening another workflow.', 'Speichere die Veröffentlichungsangaben, bevor du diese Angaben änderst oder einen anderen Ablauf öffnest.')}</p> : null}
    {feedback ? <div role="alert" className={styles.error}><p>{feedback}</p>{error === 'load_failed' || error === 'stale_metadata' ? <button type="button" className="btn btn-sm" onClick={() => { if (!dirty || window.confirm(copy('Reload the saved details and discard your unsaved title and slug?', 'Gespeicherte Angaben neu laden und deine ungespeicherten Eingaben für Titel und URL-Namen verwerfen?'))) { setLoading(true); setError(''); setAttempt(attempt + 1); } }}>{copy('Reload saved details', 'Gespeicherte Angaben neu laden')}</button> : null}</div> : null}
    {data ? <>
      <details name="constitution-editor-details" open><summary>{copy('Constitution', 'Verfassung')}</summary><div className={styles.section}>
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <label className={styles.field}>{copy('Title', 'Titel')}<input value={title} maxLength={200} required disabled={!canEdit || sessionDirty || loading || saving} onChange={event => { setTitle(event.target.value); setSaved(false); }} /></label>
          <details><summary>{copy('Advanced', 'Erweitert')}</summary><div className={styles.section}><label className={styles.field}>{copy('URL slug', 'URL-Name')}<input value={slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" required disabled={!canEdit || sessionDirty || loading || saving} onChange={event => { setSlug(event.target.value); setSaved(false); }} /></label><p className={styles.muted}>{copy('Previous URLs remain as permanent aliases.', 'Frühere URLs bleiben als dauerhafte Weiterleitungen erhalten.')}</p></div></details>
          {canEdit ? <div className={styles.actions}><button className="btn btn-primary" disabled={!dirty || sessionDirty || loading || saving}>{saving ? copy('Saving…', 'Wird gespeichert…') : copy('Save constitution details', 'Verfassungsangaben speichern')}</button><span role="status" className={styles.muted}>{saved ? copy('Constitution details saved.', 'Verfassungsangaben gespeichert.') : dirty ? copy('Unsaved changes', 'Ungespeicherte Änderungen') : ''}</span></div> : null}
        </form>
      </div></details>
      <details name="constitution-editor-details"><summary>{copy('Version', 'Textversion')}</summary><div className={styles.section}>
        <dl><dt>{copy('Version', 'Textversion')}</dt><dd>{data.version.versionLabel}</dd><dt>{copy('Effective date', 'Geltungsdatum')}</dt><dd>{data.version.effectiveDate ?? '—'}</dd><dt>{copy('Language', 'Sprache')}</dt><dd>{data.version.languageCode}</dd><dt>{copy('Gazette reference', 'Fundstelle')}</dt><dd>{data.versionFacts?.gazetteReference ?? '—'}</dd>{httpUrl(data.versionFacts?.sourceUrl) ? <><dt>{copy('Source', 'Quelle')}</dt><dd><a href={httpUrl(data.versionFacts?.sourceUrl)!} target="_blank" rel="noreferrer">{data.versionFacts?.sourceUrl}</a></dd></> : null}</dl>
        <p className={styles.muted}>{copy('Version facts belong to the published record. Corrections use the relevant editorial workflow.', 'Angaben zur Textversion gehören zum veröffentlichten Stand. Korrekturen erfolgen im zugehörigen Redaktionsablauf.')}</p>
      </div></details>
      <details name="constitution-editor-details"><summary>{copy('Archival source', 'Archivquelle')}</summary><div className={styles.section}>
        <SourceDescription evidence={data.version.sourceEvidence ?? null} />
        {canEdit ? <form action="/editor/command" method="post" onSubmit={event => { if (blocked) event.preventDefault(); }}><input type="hidden" name="command" value="open-sources" /><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="scope" value="sources" /><div className={styles.actions}><button className="btn" disabled={blocked}>{copy('Edit source information', 'Quelleninformationen bearbeiten')}</button></div></form> : null}
        <p className={styles.muted}>{copy('Separate correction draft → review → publication', 'Eigener Korrekturentwurf → Prüfung → Veröffentlichung')}</p>
      </div></details>
      <details name="constitution-editor-details"><summary>{copy('Structure & display', 'Struktur & Anzeige')}</summary><div className={styles.section}>
        {data.outline ? <dl><dt>{copy('Levels', 'Ebenen')}</dt><dd>{data.outline.kinds.map(kind => kind.displayLabel).join(' · ')}</dd>{data.outline.kinds.filter(kind => kind.segmentation === 'sentence').map(kind => <Fragment key={kind.kindCode}><dt>{kind.displayLabel}</dt><dd>{kind.presentation === 'concatenated' ? copy('Flowing text', 'Fließtext') : copy('One sentence per line', 'Ein Satz pro Zeile')}{' · '}{(kind.sentenceDelimiters ?? ['.', '!', '?']).join(' ')}</dd></Fragment>)}</dl> : <p className={styles.muted}>{copy('Structure settings are unavailable.', 'Struktureinstellungen sind nicht verfügbar.')}</p>}
        <p className={styles.muted}>{copy('Display settings for this text version.', 'Anzeigeeinstellungen für diese Textversion.')}</p>
        {canManageStructure ? link('/admin/constitutions/' + encodeURIComponent(constitutionId), copy('Edit structure settings', 'Struktureinstellungen bearbeiten')) : null}
      </div></details>
      <details name="constitution-editor-details"><summary>{copy('Lifecycle', 'Geltungsverlauf')}</summary><div className={styles.section}>
        {data.events.length ? <ol>{data.events.map(event => <li key={event.id}><time dateTime={event.eventDate}>{event.eventDate}</time>{' · '}{t(ui.lifecycleEvents[event.eventType])}{event.note ? ' · ' + event.note : ''}</li>)}</ol> : <p className={styles.muted}>{copy('No lifecycle events recorded.', 'Noch keine Geltungsereignisse erfasst.')}</p>}
        <p className={styles.muted}>{copy('Publishers record dated events; status is derived from the history.', 'Veröffentlichende erfassen datierte Ereignisse; der Status ergibt sich aus diesem Verlauf.')}</p>
        {canPublish && code ? link('/editor/lifecycle/' + encodeURIComponent(constitutionId) + '?' + new URLSearchParams({ code, versionId }), copy('Record lifecycle event', 'Geltungsereignis erfassen')) : null}
      </div></details>
      {dirty ? <p className={styles.muted}>{copy('Save the constitution details before opening another workflow.', 'Speichere die Verfassungsangaben, bevor du einen anderen Ablauf öffnest.')}</p> : null}
    </> : null}
  </section>;
}
