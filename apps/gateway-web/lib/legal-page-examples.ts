import type { LegalPageKey } from './legal-pages';

// Review aid only. These are fictional details and are never published automatically.
export function exampleLegalPage(key: LegalPageKey): string {
  if (key === 'impressum_en') {
    return `EXAMPLE — REPLACE BEFORE PUBLICATION

Publisher details and legally required disclosures must be reviewed for the actual operator before publication. The address and contact details are maintained separately and shared by every language version.`;
  }
  if (key === 'datenschutz_en') {
    return `EXAMPLE — REPLACE BEFORE PUBLICATION

This privacy notice must describe the actual operator, hosting, processing, retention and data subject rights. Review the published German notice and the real deployment before publication.`;
  }
  if (key === 'impressum') {
    return `BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN

Pflichtangaben zum Anbieter werden in den gemeinsamen Kontaktfeldern gepflegt und in beiden Sprachen angezeigt. Hier ergänzen Sie nach rechtlicher Prüfung weitere Angaben wie Rechtsform, Vertretung, Register und Umsatzsteuer-ID, soweit sie für den tatsächlichen Betreiber erforderlich sind.`;
  }
  return `BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN

Verantwortlicher: Verfassung Atlas Musterbetrieb, Musterstraße 1, 10115 Berlin, kontakt@example.org.

Beispiel-Hoster: Beispielhosting GmbH, Rechenzentrum in Deutschland. Tatsächlichen Anbieter, Standort, Unterauftragsverarbeiter und Auftragsverarbeitungsvertrag prüfen.

Beim Aufruf der Website verarbeitet der tatsächliche Hoster technisch erforderliche Verbindungsdaten. Welche Daten er protokolliert und wie lange er sie speichert, muss vor Veröffentlichung anhand des Hostingvertrags ergänzt werden.

Bei Anmeldung verwendet die Website notwendige Sitzungs- und MFA-Cookies. Ein lokal gespeicherter Wert merkt sich, dass der Cookie-Hinweis geschlossen wurde. Nach dem aktuellen Code-Audit werden keine Analyse- oder Werbe-Cookies eingesetzt.

Angaben zu Rechtsgrundlagen, Empfängern, Löschfristen, Betroffenenrechten, Beschwerdestelle und möglichen Drittlandtransfers müssen für den tatsächlichen Betrieb ergänzt und rechtlich geprüft werden.`;
}
