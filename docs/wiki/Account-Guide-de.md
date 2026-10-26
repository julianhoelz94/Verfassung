# Konto und Sicherheit

**Schnelleinstieg:** Anmelden → Konto. Abschnittslinks führen zu Einstellungen, Kontosicherheit und verbundenen Anwendungen.

## Anmelden oder Zugang anfordern

1. Öffnen Sie **Anmelden** und verwenden Sie Ihr Passwort oder einen eingerichteten Passkey.
2. Geben Sie bei Aufforderung den Code Ihrer Authenticator-App ein.
3. Öffnen Sie **Konto**, um Einstellungen zu verwalten.

Falls **Registrieren** angeboten wird, fordern Sie Zugang per E-Mail an. Öffnen Sie den einmaligen Bestätigungslink innerhalb von 24 Stunden und legen Sie Ihr Passwort fest. Neue Konten erhalten Leserechte; redaktionelle Rollen vergibt die Administration. Andernfalls benötigen Sie eine Einladung. Zur Passwortwiederherstellung verwenden Sie den für Ihr Konto versandten Link.

## Das Konto absichern

1. Öffnen Sie **Konto → Kontosicherheit**, bestätigen Sie Ihr aktuelles Passwort und starten Sie die Authenticator-Einrichtung.
2. Scannen Sie den QR-Code und geben Sie den sechsstelligen App-Code ein. **QR-Code lässt sich nicht scannen?** öffnet bei Bedarf den manuellen Schlüssel.
3. Speichern Sie die neuen Wiederherstellungscodes vertraulich: Sie werden nur einmal angezeigt.
4. Optional richten Sie nach Bestätigung Ihres Passworts einen Passkey ein.

![Kontosicherheit und Passkey-Verwaltung](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/account-security-de.png)
*Authenticator und Passkeys sind in der Kontosicherheit gebündelt.*

**Kein Zugriff auf die App?** Wählen Sie bei der Abfrage **Wiederherstellungscode verwenden**. Jeder Code gilt einmal. **Stattdessen Authenticator-App verwenden** führt zurück. **Wiederherstellungscodes ersetzen** öffnet die Bestätigung und macht beim Abschluss den alten Satz ungültig.

Administration und Herausgeber benötigen für geschützte Aktionen zusätzliche Verifikation. Auch nach der Anmeldung kann eine frische MFA-Prüfung erforderlich sein.

Ein eingerichteter Passkey schützt auch die Passwortanmeldung: Ein Passwort kann die Ersteinrichtung nicht erneut starten. Wählen Sie bei der Abfrage oder Bestätigung **Passkey verwenden**. Zum Hinzufügen oder Entfernen von Passkeys ist eine frische Bestätigung nötig, wenn bereits ein zweiter Faktor existiert. Administration und Herausgeber können ihren letzten zweiten Faktor nicht entfernen. Importzugriff erfordert auch bei Redakteuren ohne allgemeine MFA-Pflicht eine tatsächliche, kürzlich erfolgte Bestätigung des zweiten Faktors.

Ein Passwortwechsel widerruft andere Sitzungen, offene Einrichtungs- und Rücksetzlinks sowie persönliche MCP/OAuth-Zugangsdaten. Nach einer Passwortzurücksetzung, Kontosperre oder Rollenänderung werden alle Sitzungen, offenen Einrichtungsabfragen und persönlichen Client-Zugangsdaten widerrufen. Melden Sie sich erneut an und verbinden Sie betroffene Clients neu. Eine gesperrte Einladung kann das Konto nicht aktivieren.

## Sprache und Inhaltsübersetzung

| Einstellung | Wirkung |
| --- | --- |
| **Sprache der Website** | Deutsch, Englisch oder automatische Gerätesprache. Gespeicherte Einstellungen gelten auch auf anderen Geräten. Nicht unterstützte oder deaktivierte Sprachen fallen auf die konfigurierte Website-Vorgabe zurück. |
| **Diesen Inhalt übersetzen** | Fordert auf unterstützten Seiten eine maschinelle Übersetzung an. Anmeldung und Freigabe durch die Administration sind nötig. **Original anzeigen** stellt den Quelltext wieder her. |
| **Inhalte immer übersetzen** | Übersetzt unterstützte Inhalte automatisch, wenn keine redaktionelle Sprachfassung verfügbar ist. |

Oberfläche und Anleitungen werden vorab übersetzt. Redaktionelle Sprachfassungen haben Vorrang vor maschinellen Übersetzungen. Prüfen Sie genaue Formulierungen am Original. Eine angeforderte Übersetzung übermittelt den ausgewählten Text an den eingerichteten Anbieter.

<details>
<summary>Eigener Übersetzungsschlüssel und verbundene Recherche-Clients</summary>

Unter **Inhaltsübersetzung** können Sie einen eigenen Google-Translate-API-Schlüssel speichern. Er wird verschlüsselt, danach nicht erneut angezeigt und nutzt das Kontingent Ihres Google-Projekts statt des gemeinsamen Website-Kontingents. Die Administration kann Übersetzung deaktivieren oder den gemeinsamen Anbieter zwischen Google und DeepL wechseln.

Unter **Verbundene Anwendungen** verwalten Sie OAuth-Verbindungen und persönliche MCP-Schlüssel einschließlich Ablauf, Austausch und Widerruf. Kopieren Sie neue Schlüssel bei der einmaligen Anzeige und bewahren Sie sie vertraulich auf. Gewähren Sie nur benötigte Rechte: Importrechte dienen nur zur Bereitstellung für die Prüfung, nicht zur Veröffentlichung. Optionale Verbindungsanleitungen lassen sich aufklappen.

</details>

[[Lesen|User-Guide-de]] · [[Redaktion|Editorial-Guide-de]] · [[English|Account-Guide]]
