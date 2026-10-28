'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { useTranslation } from '../components/TranslationProvider';
import styles from './EditorWorkspace.module.css';

export function EditorWorkspace({ navigation, session, children }: { navigation: ReactNode; session: ReactNode; children: ReactNode }) {
  const [shown, setShown] = useState(false), id = useId(), t = useTranslation();
  useEffect(() => {
    try {
      const value = localStorage.getItem('atlas-editor-navigation');
      if (value != null) queueMicrotask(() => setShown(value === 'shown'));
    } catch { /* The editor remains usable when browser storage is unavailable. */ }
  }, []);
  function toggleNavigation() {
    const next = !shown; setShown(next);
    try { localStorage.setItem('atlas-editor-navigation', next ? 'shown' : 'hidden'); } catch { /* View preference is optional. */ }
  }
  return <div className={styles.workspace} data-navigation={shown ? 'shown' : 'hidden'}>
    <div className={styles.controls}>
      <button type="button" className="btn btn-ghost btn-sm" aria-controls={id} aria-expanded={shown}
        aria-label={t(shown ? { en: 'Hide article navigation', de: 'Artikelnavigation ausblenden' } : { en: 'Show article navigation', de: 'Artikelnavigation einblenden' })}
        onClick={toggleNavigation}><PanelLeft size={18} aria-hidden="true" /></button>
      <details className={styles.session}><summary>{t({ en: 'Session and publication', de: 'Sitzung und Veröffentlichung' })}</summary>{session}</details>
    </div>
    <div id={id} hidden={!shown} className={styles.navigation}>{navigation}</div>
    <div className={styles.document}>{children}</div>
  </div>;
}
