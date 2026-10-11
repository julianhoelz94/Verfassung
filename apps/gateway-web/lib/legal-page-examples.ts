import type { LegalPageKey } from './legal-pages';

// Review aid only. These are fictional details and are never published automatically.
export function exampleLegalPage(key: LegalPageKey): string {
  if (key === 'impressum') {
    return `BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN

Verfassung Atlas Musterbetrieb
Musterstraße 1
10115 Berlin
Deutschland

E-Mail: kontakt@example.org

Weitere Angaben wie Rechtsform, Vertretung, Register und Umsatzsteuer-ID sind je nach tatsächlichem Betreiber zu ergänzen.`;
  }
  return `BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN

Verantwortlicher: Verfassung Atlas Musterbetrieb, Musterstraße 1, 10115 Berlin, kontakt@example.org.

Beispiel-Hoster: Beispielhosting GmbH, Rechenzentrum in Deutschland. Tatsächlichen Anbieter, Standort, Unterauftragsverarbeiter und Auftragsverarbeitungsvertrag prüfen.

Beim Aufruf der Website verarbeitet der tatsächliche Hoster technisch erforderliche Verbindungsdaten. Welche Daten er protokolliert und wie lange er sie speichert, muss vor Veröffentlichung anhand des Hostingvertrags ergänzt werden.

Bei Anmeldung verwendet die Website notwendige Sitzungs- und MFA-Cookies. Ein lokal gespeicherter Wert merkt sich, dass der Cookie-Hinweis geschlossen wurde. Nach dem aktuellen Code-Audit werden keine Analyse- oder Werbe-Cookies eingesetzt.

Angaben zu Rechtsgrundlagen, Empfängern, Löschfristen, Betroffenenrechten, Beschwerdestelle und möglichen Drittlandtransfers müssen für den tatsächlichen Betrieb ergänzt und rechtlich geprüft werden.`;
}
