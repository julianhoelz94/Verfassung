import { FileDown, ChevronDown } from 'lucide-react';
import { documentLibraryUi as m } from '../../lib/document-library-messages';
import { useTranslation } from '../components/TranslationProvider';
import chrome from '../components/layout/PageChrome.module.css';
import styles from './DocumentLibrary.module.css';

export function DocumentExport({ label, folderId, documentIds }: { label: string; folderId?: string; documentIds?: string[] }) {
  const t = useTranslation();
  function href(includeFiles: boolean) {
    const params = new URLSearchParams({ action: 'export' });
    if (folderId) params.set('folderId', folderId);
    if (documentIds?.length) params.set('documentIds', documentIds.join(','));
    if (includeFiles) params.set('includeFiles', 'true');
    return `/documents/command?${params}`;
  }
  return <details className={styles.exportMenu} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
  }}>
    <summary className={chrome.tool}><FileDown aria-hidden="true" /><span>{label}</span><ChevronDown aria-hidden="true" /></summary>
    <div className={styles.exportOptions}>
      <a href={href(false)} download onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); }}>{t(m.exportBibliography)}</a>
      <a href={href(true)} download onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); }}>{t(m.exportWithFiles)}</a>
    </div>
  </details>;
}
