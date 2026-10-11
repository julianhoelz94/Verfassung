'use client';

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
        Cookie-Einstellungen
      </button>
      {open ? (
        <section className="cookie-notice" aria-label="Cookie-Einstellungen" lang="de">
          <p><strong>Cookies auf dieser Website</strong></p>
          <p>Wir nutzen notwendige Cookies für Anmeldung und Sicherheit. Keine Analyse- oder Werbe-Cookies.</p>
          <p>Das Schließen dieses Hinweises merken wir uns lokal. Mehr in der <a href="/datenschutz">Datenschutzerklärung</a> und im <a href="/impressum">Impressum</a>.</p>
          <button className="btn btn-secondary btn-sm" type="button" onClick={dismiss}>Verstanden</button>
        </section>
      ) : null}
    </>
  );
}
