# Rollen und Zugriffsrechte

Rollen verleihen einem Konto bestimmte Fähigkeiten. Ihre Rechte **addieren sich**: Mit Bearbeiter und Prüfer kann dieselbe Person Inhalte vorbereiten und freigeben. Herausgeber schließt Bearbeiter und Prüfer nicht automatisch ein. Administrator umfasst alle redaktionellen Fähigkeiten und die Administration.

Die Oberfläche bezeichnet die Rolle `viewer` als **Leser**. Neu selbstregistrierte Konten erhalten diese Rolle. Zum Lesen veröffentlichter Inhalte ist keine redaktionelle Rolle nötig. Ob Besucher sich dafür anmelden müssen, bestimmt die Einstellung zum anonymen Zugriff.

| Rolle | Gewährter Zugriff |
| --- | --- |
| **Leser** (`viewer`) | Veröffentlichte Verfassungstexte, Änderungen, Lebenszyklusereignisse, Wiki-Seiten und öffentlich verknüpfte Dokumente lesen; suchen und veröffentlichte Fassungen vergleichen. Eigene Kontoeinstellungen und Sicherheit verwalten. Keine redaktionellen oder administrativen Befehle. |
| **Bearbeiter** (`editor`) | Textentwürfe erstellen, speichern und einreichen; Importe vorbereiten; Änderungsentwürfe und Passagennotizen bearbeiten; Wiki-Entwürfe speichern; Dokumente erstellen und überarbeiten. Kommentare und Materialien zu Änderungen und einzelnen Änderungspassagen verwalten. Diese Rolle allein erlaubt weder Freigabe noch Veröffentlichung von Verfassungstexten. |
| **Prüfer** (`reviewer`) | Redaktionelle Arbeit und Revisionsverläufe einsehen; eingereichte Textentwürfe freigeben; vorbereitete Importe freigeben oder ablehnen. Keine Schreibrechte für Entwürfe oder Dokumente, keine Veröffentlichung und keine Bearbeitung von Lebenszyklusereignissen. |
| **Herausgeber** (`publisher`) | Freigegebene Texte und Importe veröffentlichen; Änderungseinträge veröffentlichen oder zurückziehen; gespeicherte Wiki-Revisionen veröffentlichen. Lebenszyklusereignisse der Verfassung oder einzelner Bestimmungen erfassen, Ereignisbelege überarbeiten und zugehörige Kommentare und Materialien verwalten. Keine Schreib- oder Freigaberechte für Textentwürfe. |
| **Administrator** (`admin`) | Alle redaktionellen Fähigkeiten sowie Kontoeinladungen, Rollenzuweisung, Kontoaktivierung und -deaktivierung, Diensttoken, Verfassungskonfiguration, Website-Einstellungen, Zugriffsregeln, Ersteinrichtung und Betreiber-/Rechtstexte verwalten. |

## Rechtematrix

Jede Spalte gilt für ein Konto, das **nur diese Rolle** besitzt. Bei mehreren Rollen werden die Rechte vereinigt. Voraussetzungen zu Arbeitsstatus, Eigentümerschaft, Validierung und zweitem Faktor gelten weiterhin.

| Aktion | Leser | Bearbeiter | Prüfer | Herausgeber | Administrator |
| --- | :---: | :---: | :---: | :---: | :---: |
| Veröffentlichte Inhalte und Vergleiche lesen | ✓ | ✓ | ✓ | ✓ | ✓ |
| Redaktionelle Arbeitsbereiche und Verläufe einsehen | — | ✓ | ✓ | ✓ | ✓ |
| Textentwurf öffnen, speichern und einreichen | — | ✓ | — | — | ✓ |
| Eingereichten Text freigeben | — | — | ✓ | — | ✓ |
| Freigegebenen Text veröffentlichen | — | — | — | ✓ | ✓ |
| Import vorbereiten | — | ✓ | — | — | ✓ |
| Vorbereiteten Import freigeben/ablehnen | — | — | ✓ | — | ✓ |
| Freigegebenen Import veröffentlichen | — | — | — | ✓ | ✓ |
| Änderungsentwürfe und Passagennotizen bearbeiten | — | ✓ | — | — | ✓ |
| Änderungseinträge veröffentlichen/zurückziehen | — | — | — | ✓ | ✓ |
| Kommentare und Materialien zu Änderungen/Passagen verwalten | — | ✓ | — | — | ✓ |
| Wiki-Entwurf speichern | — | ✓ | — | — | ✓ |
| Gespeicherte Wiki-Revision veröffentlichen | — | — | — | ✓ | ✓ |
| Dokumente in der Bibliothek erstellen/überarbeiten | — | ✓ | — | — | ✓ |
| Lebenszyklusereignisse erfassen und ihre Belege überarbeiten | — | — | — | ✓ | ✓ |
| Kommentare und Materialien zu Lebenszyklusereignissen verwalten | — | — | — | ✓ | ✓ |
| Konten, Rollen und Website-Einstellungen verwalten | — | — | — | — | ✓ |

Schreibzugriff auf die Bibliothek erfordert Bearbeiter oder Administrator. Herausgeber und Prüfer können die Bibliothek einsehen. Herausgeber dürfen Materialien über die Steuerelemente eines Lebenszyklusereignisses verwalten; dies verleiht keine allgemeinen Bibliotheksschreibrechte. Schreibzugriff auf die Dokumentbibliothek erlaubt nicht automatisch jede Verknüpfungsänderung. Veröffentlichte Änderungsbelege bleiben an ihre Revision gebunden; unabhängig gepflegte Kommentare besitzen eigene revisionierte Verknüpfungen. Belegrevisionen zu Lebenszyklusereignissen bewahren Ereignisart und rechtliches Datum des Originals.

## Kombination von Rollen

Mit **Bearbeiter + Prüfer** können Texte vorbereitet und freigegeben werden; zur Veröffentlichung fehlt Herausgeber. **Prüfer + Herausgeber** darf eingereichte Arbeit freigeben und veröffentlichen, benötigt zum Schreiben eines Textentwurfs aber zusätzlich Bearbeiter. **Bearbeiter + Prüfer + Herausgeber** kann den gesamten Ablauf mit einem Konto ausführen. Freigabe und Veröffentlichung bleiben getrennte Entscheidungen; ein zweites Konto ist nicht vorgeschrieben.

Die Rollen bilden keine Rangfolge. Der Zugriff von Herausgebern auf Lebenszyklusereignisse folgt aus ihrer Verantwortung für öffentliche Rechtsstatusangaben und verleiht keine allgemeinen Bearbeiterrechte. Administrator ist die Ausnahme und umfasst alle redaktionellen Fähigkeiten.

## Durchsetzung und Kontosicherheit

Bearbeitungslinks erscheinen nur für berechtigte Rollen. Prüfer und Herausgeber können bei einer Änderung einen Link **Arbeitsbereich öffnen** sehen, ohne dadurch Entwürfe bearbeiten zu dürfen. Der Ereigniseditor ist für Herausgeber und Administratoren zugänglich. Ein direkt geöffneter Link verleiht keine Rechte: Der zuständige Dienst prüft jeden Befehl.

Rollen allein reichen nicht immer aus. Eigentümerschaft, Arbeitsstatus, unveränderliche veröffentlichte Revisionen und Eingabeprüfungen begrenzen zulässige Aktionen. Herausgeber und Administratoren benötigen für geschützte Aktionen einen zweiten Faktor; Veröffentlichung und andere sensible Befehle können eine erneute MFA-Bestätigung erfordern. Importzugangsdaten benötigen auch bei Bearbeitern eine aktuelle Prüfung des zweiten Faktors.

Administratoren vergeben Rollen. Rollenänderungen oder die Deaktivierung eines Kontos widerrufen dessen Sitzungen und persönliche MCP-/OAuth-Zugangsdaten. Betroffene Personen müssen sich erneut anmelden und Clients neu verbinden. Diensttoken besitzen eigene Rollen, Berechtigungsbereiche und Widerrufskontrollen. Eine eng begrenzte Automatisierungsberechtigung erweitert nicht die Rolle eines interaktiven Kontos.

[[Konto und Sicherheit|Account-Guide-de]] · [[English|Roles-and-Access]]
