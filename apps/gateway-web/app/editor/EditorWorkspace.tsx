'use client';

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { useTranslation } from '../components/TranslationProvider';
import styles from './EditorWorkspace.module.css';

const NavigationContext = createContext<{ shown: boolean; id: string; toggle: () => void } | null>(null);

export function EditorNavigationToggle() {
  const navigation = useContext(NavigationContext), t = useTranslation();
  if (!navigation) return null;
  const label = t(navigation.shown ? { en: 'Hide article navigation', de: 'Artikelnavigation ausblenden' } : { en: 'Show article navigation', de: 'Artikelnavigation einblenden' });
  return <button type="button" className="btn btn-ghost btn-sm" aria-controls={navigation.id} aria-expanded={navigation.shown}
    aria-label={label} title={label} onClick={navigation.toggle}><PanelLeft size={18} aria-hidden="true" /></button>;
}

export function EditorWorkspace({ navigation, session, children, inlineControls = false }: { navigation: ReactNode; session: ReactNode; children: ReactNode; inlineControls?: boolean }) {
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
  const sessionDetails = <details className={styles.session}><summary>{t({ en: 'Session and publication', de: 'Sitzung und Veröffentlichung' })}</summary>{session}</details>;
  return <NavigationContext.Provider value={{ shown, id, toggle: toggleNavigation }}><div className={styles.workspace} data-navigation={shown ? 'shown' : 'hidden'}>
    {!inlineControls ? <div className={styles.controls}><EditorNavigationToggle />{sessionDetails}</div> : null}
    <div id={id} hidden={!shown} className={styles.navigation}>{navigation}</div>
    <div className={styles.document}>{children}</div>
    {inlineControls ? sessionDetails : null}
  </div></NavigationContext.Provider>;
}
