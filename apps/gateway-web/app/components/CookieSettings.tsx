'use client';

import { T, ui } from './TranslationProvider';
import { useEffect, useState } from 'react';

export const COOKIE_NOTICE_KEY = 'ca_cookie_notice_v1';

export function CookieSettings() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(COOKIE_NOTICE_KEY) !== 'dismissed');
    } catch {
      setOpen(true);
    }
  }, []);

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
        <section className="cookie-notice" aria-label="Cookie-Einstellungen" lang="de">
          <p><strong><T value={ui.components.cookiesettings.cookiesAufDieserWebsite} /></strong></p>
          <p><T value={ui.components.cookiesettings.wirNutzenNotwendigeCookiesFurAnmeldungUnd} /></p>
          <p><T value={ui.components.cookiesettings.dasSchlieenDiesesHinweisesMerkenWirUns} />{" "}<a href="/datenschutz"><T value={ui.components.cookiesettings.datenschutzerklarung} /></a> <T value={ui.components.cookiesettings.undIm} />{" "}<a href="/impressum"><T value={ui.components.cookiesettings.impressum} /></a>.</p>
          <button className="btn btn-secondary btn-sm" type="button" onClick={dismiss}><T value={ui.components.cookiesettings.verstanden} /></button>
        </section>
      ) : null}
    </>
  );
}
