# Administration und Einrichtung

**Erforderlich: Administrator.** Öffnen Sie **Admin** und wählen Sie die Aufgabe.

| Aufgabe | Einstieg | Abschluss |
| --- | --- | --- |
| Einladen oder Rollen ändern | **Nutzer** | Rollen speichern; bei Bedarf Sitzungen widerrufen. |
| Mail und Registrierung einrichten | **Website-Einstellungen** | Testmail senden, dann Registrierung aktivieren. |
| Sprachen festlegen | **Website-Einstellungen** | Verfügbare Sprachen und Vorgabe speichern. |
| Besucherzugriff ändern | **Anonymes Lesen** | Richtlinie und Limits mit frischer MFA speichern. |
| Verfassungsstruktur festlegen | **Gliederungen** | Vorschau vor der Texteingabe prüfen. |
| Inhalte importieren | **Import** | Bestehende/neue Struktur wählen, JSON hochladen und Auftrag prüfen. |
| Betreiber-/Datenschutztexte veröffentlichen | **Rechtliche Seiten** | Speichern, gespeicherte Vorschau prüfen, dann veröffentlichen. |

![Nach Aufgaben gruppierte Administrationsübersicht](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/admin-overview-de.png)
*Wählen Sie zuerst die Aufgabe, dann den Arbeitsbereich.*

![Import mit Strukturwahl vor dem Hochladen](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/admin-import-de.png)
*Zuerst das Ziel wählen, dann hochladen. „Stattdessen JSON einfügen“ öffnet die erweiterte Eingabe.*

Das Kontomenü gruppiert die Ziele zum Entdecken, zur Redaktion und zur Administration. Öffnen Sie eine Gruppe, um ihre Links zu sehen; die Gruppe des aktuellen Arbeitsbereichs ist bereits geöffnet. Konto und Abmeldung bleiben direkt erreichbar.

Die Nutzerzeilen zeigen E-Mail-Adresse, Status und Rollenkennzeichnungen. **Rollen bearbeiten** öffnet die Rollenauswahl. Speichern Sie mit **Rollen aktualisieren** oder verwerfen Sie die Auswahl mit **Abbrechen**. Die Steuerelemente für Dienst-Tokens stehen in einem eigenen Abschnitt unter der Nutzerliste.

## Erste Einrichtung

Eine Rollenänderung oder Kontosperre widerruft Sitzungen, offene Einrichtungsabfragen und persönliche MCP/OAuth-Zugangsdaten. Die Sperre eines eingeladenen Kontos macht auch die Einladung ungültig. Eine erneute Aktivierung stellt widerrufene Zugangsdaten nicht wieder her. Automatisierungs-Tokens werden weiterhin separat ausgetauscht oder widerrufen.


Neue Installationen bleiben für Besucher und andere Konten gesperrt, bis der in der Bereitstellungsumgebung festgelegte Administrator die Einrichtung abschließt. In Produktion wird HTTPS vor der Passworteingabe vorbereitet. Nach Anmeldung und gegebenenfalls Authenticator-Einrichtung führt die Einrichtungsseite durch Sprachen, Zugriff, Betreiberangaben und E-Mail. Anfangs sind alle unterstützten Website-Sprachen verfügbar.

Die Seite für den Besucherzugriff bietet **Zurück zur Einrichtung**, auch nach dem Speichern der Richtlinie. Tatsächliche Betreiberangaben sowie die erforderlichen deutschen und englischen Rechtstexte müssen geprüft und ausdrücklich veröffentlicht werden. Unter **E-Mail und Selbstregistrierung** deaktiviert **E-Mail später konfigurieren** die SMTP-Eingaben, Testmail und Selbstregistrierung. Speichern Sie diese Auswahl im selben Formular; vorhandene SMTP-Angaben bleiben erhalten. Wenn Sie die Registrierung später anbieten möchten, heben Sie die Auswahl auf, richten den Mailversand ein, aktivieren und speichern ihn und senden vor dem Einschalten der Registrierung eine Testmail. Neue Nutzer müssen ihre E-Mail-Adresse bestätigen. Vor dem Öffnen der Website prüft der Server die Pflichtangaben erneut. Die Prüfung der tatsächlichen Produktions- und Hosting-Angaben aus VER-269 bleibt erforderlich.

Fortschritt und Abschluss liegen dauerhaft in der Identity-Datenbank. Ein Anwendungsupdate startet die Einrichtung nicht erneut. Später bleiben die Einstellungen unter **Admin → Website-Einstellungen** erreichbar. Durch die Bereitstellungsumgebung vorgegebene Werte sind entsprechend gekennzeichnet; Geheimnisse werden nur als eingerichtet oder nicht eingerichtet angezeigt.

Produktionsanleitungen bleiben [[ausstehend|Deployment-Information]], bis CD und ein verifiziertes Verfahren existieren.

## Einstellungen und Veröffentlichung im Detail

<details>
<summary>E-Mail, Rechtstexte, Übersetzung und Besucherlimits</summary>



Unter **Admin** finden Sie **Nutzer**, **Website-Einstellungen**, **Gliederungen** und **Import**. Suchen Sie unter Nutzer nach Konten, laden Sie Personen ein, vergeben Sie Rollen und widerrufen Sie Sitzungen. In den Website-Einstellungen konfigurieren Sie den Mailversand, senden eine Test-E-Mail an eine angegebene Adresse und aktivieren oder deaktivieren die Selbstregistrierung. Bei neuen Installationen sind Mailversand und Selbstregistrierung deaktiviert. Konfigurieren und prüfen Sie den Mailversand, bevor Sie die Registrierung einschalten. Unter Gliederungen konfigurieren Sie die Struktur einer Verfassung und prüfen die Vorschau, bevor Text erfasst wird. Unter Import laden Sie Inhalte in den überprüften Vorbereitungsablauf und prüfen den Auftrag. Vorbereitete Daten werden erst nach den nötigen Prüf- und Veröffentlichungsschritten öffentlich.

Unter Admin stehen auch die **Rechtlichen Seiten**. Speichern Sie einen privaten Entwurf von Impressum oder Datenschutzerklärung, prüfen Sie seinen Inhalt und veröffentlichen Sie ihn in einem eigenen Schritt. Bestätigen Sie vor dem öffentlichen Start die tatsächlichen Betreiberangaben. Änderungen an rechtlichen Seiten veröffentlichen keinen Verfassungstext.

Die deutschen und englischen Rechtstexte haben getrennte Entwürfe und Veröffentlichungsschritte. Bearbeiten Sie Impressumstext und gemeinsame Angaben zu Name, Anschrift und E-Mail in einem Formular. Wählen Sie einmal **Entwurf speichern**, prüfen Sie die **Vorschau des gespeicherten Entwurfs** und wählen Sie dann **Geprüftes Impressum veröffentlichen**. Jeder Schritt aktualisiert den Text der gewählten Sprache und die gemeinsamen Kontaktdaten zusammen. Der Text der anderen Sprache bleibt unverändert; beide Sprachen verwenden die veröffentlichten Kontaktdaten. Wiederholen Sie diese Angaben nicht im Rechtstext und ersetzen Sie Beispielinhalte vor der Veröffentlichung. Fehlt die englische Veröffentlichung, wird das deutsche Original mit einem Hinweis angezeigt.

Bei Validierungsfehlern werden weder Text noch Kontaktänderungen veröffentlicht. Fehlermeldungen benennen Beispielinhalte, doppelte Kontaktdaten oder einen veralteten Entwurf, der neu geladen werden muss. Nicht gespeicherte Änderungen sind nicht Teil der Veröffentlichung. Prüfen Sie deshalb die gespeicherte Vorschau.

Ein vor dieser Funktion veröffentlichtes Impressum kann die Anschrift noch im Text enthalten. Es bleibt ohne zusätzlich angehängte gemeinsame Kontaktdaten sichtbar. Entfernen Sie die Anschrift aus dem Text und veröffentlichen Sie einen neuen Entwurf, um auf die gemeinsamen Daten umzustellen.

Unter **Admin → Website-Einstellungen → Inhaltsübersetzung** wählen Sie Deaktiviert, Google Translate oder DeepL und hinterlegen den passenden gemeinsamen API-Schlüssel. Beim Anbieterwechsel ist ein Schlüssel für den neuen Anbieter erforderlich. Für Google werden die Zeichen vor jedem Aufruf reserviert; bei 500.000 Zeichen pro UTC-Monat oder innerhalb eines gleitenden Zeitraums von 31 Tagen stoppt der gemeinsame Zugang. Ergebnisse aus dem Cache benötigen keine neue Reservierung. Ein persönlicher Google-Schlüssel wird nicht auf das gemeinsame Kontingent angerechnet. Prüfen Sie die Datenverarbeitung des Anbieters vor der Aktivierung. Ausgangstexte werden erst nach ausdrücklicher Auswahl durch angemeldete Nutzer oder bei aktivierter automatischer Kontoeinstellung übermittelt.

Unter **Anonymes Lesen** kann ein Administrator das Lesen ohne Anmeldung erlauben oder sperren. Legen Sie positive API-Anfragelimits getrennt für jede IP-Adresse und für alle anonymen Besucher zusammen fest, mit einem Zeitfenster in Minuten, Stunden oder Tagen. Zum Speichern ist eine erneute MFA-Prüfung erforderlich. Wenn **Anonymes Lesen erlauben** nicht markiert ist, werden die angezeigten Limits zu null und können nicht bearbeitet werden. Die zuvor gespeicherten positiven Limits erscheinen wieder, sobald anonymes Lesen erlaubt wird. Anmeldung und Kontoerstellung bleiben bei gesperrtem anonymem Lesen verfügbar.


</details>

[[Konto|Account-Guide-de]] · [[Redaktion|Editorial-Guide-de]] · [[English|Admin-Guide]]
