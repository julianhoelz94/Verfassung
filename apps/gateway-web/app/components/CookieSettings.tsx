'use client';

import { T, useLocale, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useState, useSyncExternalStore } from 'react';

export const COOKIE_NOTICE_KEY = 'ca_cookie_notice_v1';

function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function noticeIsUndismissed() {
  try { return localStorage.getItem(COOKIE_NOTICE_KEY) !== 'dismissed'; }
  catch { return true; }
}

const serverNoticeIsUndismissed = () => false;

export function CookieSettings() {
  const t = useTranslation();
  const locale = useLocale();
  const undismissed = useSyncExternalStore(subscribeToStorage, noticeIsUndismissed, serverNoticeIsUndismissed);
  const [openOverride, setOpen] = useState<boolean | null>(null);
  const open = openOverride ?? undismissed;

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, 'dismissed');
    } catch {
      // The information notice can still be closed when storage is unavailable.
    }
    setOpen(false);
  }

  return (
    <>
      <button className="footer-link-button" type="button" onClick={() => setOpen(true)}>
        <T value={ui.components.cookiesettings.cookieEinstellungen} />{" "}</button>
      {open ? (
        <section className="cookie-notice" aria-label={t(ui.accessibility.cookieSettings)} lang={locale}>
          <p><strong><T value={ui.components.cookiesettings.cookiesAufDieserWebsite} /></strong></p>
          <p><T value={ui.components.cookiesettings.wirNutzenNotwendigeCookiesFurAnmeldungUnd} /></p>
          <p><T value={ui.components.cookiesettings.dasSchlieenDiesesHinweisesMerkenWirUns} />{" "}<a href="/datenschutz"><T value={ui.components.cookiesettings.datenschutzerklarung} /></a> <T value={ui.components.cookiesettings.undIm} />{" "}<a href="/impressum"><T value={ui.components.cookiesettings.impressum} /></a>.</p>
          <button className="btn btn-secondary btn-sm" type="button" onClick={dismiss}><T value={ui.components.cookiesettings.verstanden} /></button>
        </section>
      ) : null}
    </>
  );
}
