# Bearbeiten, prüfen und veröffentlichen

**Ablauf:** bearbeiten → speichern → einreichen → freigeben → veröffentlichen. Anmeldung und MFA: [[Konto|Account-Guide-de]]. Einstellungen: [[Administration|Admin-Guide-de]].

## 1. Bearbeiten und einreichen

**Erforderlich: Bearbeiter oder Administrator.**

1. Öffnen Sie eine veröffentlichte Fassung und wählen Sie **Diese Verfassung bearbeiten**.
2. Wählen Sie **Diesen Text korrigieren** bei einem Übertragungsfehler oder den Pfad für die nächste Rechtsänderung bei einer Änderung des Rechts.
3. Wählen Sie die Inhaltseinheit, bearbeiten und speichern Sie den Entwurf. Prüfen Sie Vorschau und Änderungen.
4. Beschreiben und speichern Sie die Änderung, dann reichen Sie den Entwurf zur Prüfung ein.

**Ergebnis:** Der Entwurf wartet in der Prüfwarteschlange. Unter **Meine Bearbeitungen** finden Sie Entwürfe, eingereichte und freigegebene Bearbeitungen sowie veröffentlichte Ergebnisse mit ihrem jeweiligen Status. Gespeicherte Arbeit bleibt bei der Rückkehr zu dieser Liste erhalten. Ist das Einreichen noch nicht möglich, führen die Hinweise neben der Schaltfläche zu den fehlenden Angaben.

![Entwurfsbearbeitung mit Text und Arbeitsablauf](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-draft-de.png)
*Vor dem Einreichen speichern und kontrollieren.*

[▶ Bearbeitung und Einreichung ansehen](https://julianhoelz94.github.io/Verfassung/#editing-a-draft-de)

## 2. Prüfen

**Erforderlich: Prüfer oder Administrator.**

1. Öffnen Sie **Prüfliste** und die eingereichte Sitzung.
2. Vergleichen Sie Entwurf und Quelle. Prüfen Sie Kommentar, betroffene Einheiten und Änderungsart.
3. Geben Sie den Entwurf nur frei, wenn der Text bereit ist. Bei Quellenkorrekturen können Sie mit Begründung **Änderungen anfordern**. Reine Textbearbeitungen haben derzeit keine Aktion zum Zurückgeben; lassen Sie fehlerhafte Entwürfe ungeprüft. Für importierte Verfassungen gibt es eine eigene Ablehnungsaktion.

**Ergebnis:** Die Sitzung ist bereit zur Veröffentlichung. Die Freigabe veröffentlicht noch nichts.

![Eingereichter Entwurf zur Prüfung](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-review-de.png)
*Text und Kontext vor der Freigabe prüfen.*

[▶ Prüfung und Freigabe ansehen](https://julianhoelz94.github.io/Verfassung/#reviewing-a-draft-de)

### Quellenangaben korrigieren

Öffnen Sie in der aktuellen Lesefassung direkt am Block **Archivquelle** die Aktion **Quellenangaben bearbeiten**. Bearbeiter und Administratoren können Datierung und deren Genauigkeit, Umfang des Imports, Statuswortlaut und Quellenangabe ändern. Der allgemeine Hinweis zur Rechtsgeltung bleibt ein fester Seitentext.

Speichern Sie den **Quellenentwurf** mit einer Begründung und kontrollieren Sie die Gegenüberstellung der veröffentlichten und gespeicherten Angaben. Die Historie enthält jede gespeicherte Revision sowie Benutzerkonto, Zeitpunkt und Prüfentscheidungen. Noch ungespeicherte Felder verhindern das Einreichen; ein Konflikt mit einer neueren Revision erhält Ihre Eingaben.

Nach **Zur Prüfung einreichen** sind die Angaben gesperrt. Ein Prüfer kann die Korrektur freigeben oder begründete Änderungen anfordern. Nach einer Änderungsanforderung muss der Bearbeiter eine neue Quellenrevision speichern und erneut einreichen. Die Freigabe gilt für die angezeigte Revision. Wie bei Textkorrekturen darf ein Bearbeiter ohne Administratorrolle seine eigene Sitzung nicht freigeben.

Ein Herausgeber veröffentlicht die freigegebene Quellenkorrektur nach frischer MFA. Erst dann erscheinen die Angaben in einer neuen redaktionellen Fassung. Frühere Fassungen bleiben unverändert; bei einer reinen Quellenkorrektur werden sämtliche Verfassungstextrevisionen unverändert übernommen. Falls dieselbe Sitzung auch Textänderungen enthält, prüfen Sie diese über **Verfassungstext dieser Sitzung prüfen** mit.

### Importierte Verfassungen

MCP- und Dateiimporte erscheinen im Editor unter **Prüfliste**, gemeinsam mit eingereichten Bearbeitungssitzungen. Öffnen Sie den Import und prüfen Sie Quelle, eingereichte Gliederung und vorbereitete Lesevorschau. Falls erforderlich, bestätigt ein Bearbeiter/Administrator zuerst die Gliederung und bereitet den unveröffentlichten Entwurf vor. Ein Prüfer/Administrator gibt anschließend mit Begründung frei oder lehnt ab. Freigegebene Importe erscheinen unter **Bereit zur Veröffentlichung**; ein Herausgeber/Administrator veröffentlicht den exakt freigegebenen Entwurf nach frischer MFA-Prüfung.

Dasselbe Konto darf importieren, prüfen und veröffentlichen, sofern es die erforderlichen Rollen besitzt. Ein zweites Konto ist nicht erforderlich. Freigabe und Veröffentlichung bleiben getrennte Aktionen. Bestehende Importlinks öffnen diesen Ablauf im Editor.

Bei der Importprüfung stehen Verfassungstitel, Fassung und Lesevorschau im Vordergrund. Freigabe und Ablehnung besitzen jeweils ein ausgerichtetes Begründungsfeld und eine Aktionsschaltfläche. Unter **Technische Details** finden Sie bei Bedarf Import-ID, Entwurfsfassungs-ID, Inhaltsgeneration und Einstellungsrevision.

Der aktuelle Schritt steht deutlich über dem Inhalt. Nach der Freigabe lautet er **Freigegeben – Veröffentlichung steht aus**. Berechtigte Herausgeber/Administratoren sehen dann ausschließlich die Veröffentlichungsaktion. Prüfaktionen verschwinden nach der Freigabe; abgeschlossene und abgelehnte Importe bieten keine Veröffentlichungsaktion. **Inhalt und Gliederung prüfen** führt direkt zur eingereichten Hierarchie mit der bestätigten Darstellung. Fehlermeldungen unterscheiden serverseitige Konfigurations- und Dienstzugangsprobleme von einem geänderten Entwurf, fehlenden Benutzerrechten und vorübergehenden Fehlern. Eine fehlgeschlagene Bestätigung beweist nicht, dass nichts veröffentlicht wurde: Laden Sie vor einem erneuten Versuch den aktuellen Status neu.

## 3. Veröffentlichen

**Erforderlich: Herausgeber oder Administrator.**

1. Öffnen Sie **Bereit zur Veröffentlichung** und die freigegebene Sitzung.
2. Bestätigen Sie Text und Änderungsart; führen Sie bei Aufforderung die frische MFA-Prüfung durch.
3. Veröffentlichen Sie, wählen Sie **Veröffentlichte Fassung öffnen** und prüfen Sie den neuen Text. Dieser Link bleibt beim erneuten Öffnen der veröffentlichten Bearbeitung verfügbar.

**Ergebnis:** Ein neuer Textstand ist öffentlich. Der vorherige bleibt erreichbar. Eine Textberichtigung ist kein neues Gesetz.

![Freigegebener Entwurf vor der Veröffentlichung](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-publish-de.png)
*Veröffentlichung und Prüfung sind getrennte Entscheidungen.*

[▶ Veröffentlichung ansehen](https://julianhoelz94.github.io/Verfassung/#publishing-a-revision-de)

## Weitere redaktionelle Aufgaben

Der Arbeitsbereich bietet direkte Links zu **Dokumente**, **Rechtsänderungen** und **Textstände**. Prüf- und Veröffentlichungslisten erscheinen für Personen mit den entsprechenden Berechtigungen.


- Unter **Rechtsänderungen** entwerfen Sie eine Änderung und verknüpfen sie mit den genau betroffenen Bestimmungen. Prüfen Sie vor der Veröffentlichung die Links zum Ausgangs- und Zieltext.
- Unter **Dokumente** fügen Sie Quelldateien hinzu, erstellen Dateiversionen und verknüpfen diese mit Verfassungen oder Rechtsänderungen. Eine Dateiversion ist von einer Verfassungstextrevision zu unterscheiden.
- Über die Bearbeitungsfunktion einer Länder- oder Verfassungsseite erstellen Sie Hintergrundtexte und Bilder. Speichern Sie den privaten Entwurf. Ein Herausgeber prüft die Vorschau und veröffentlicht diese Seitenrevision getrennt vom Verfassungstext.
- Unter **Lebenszyklus** einer Verfassung erfassen Sie Annahme, Inkrafttreten, Aussetzung, Wiederherstellung, Aufhebung und Ereignisse zu einzelnen Bestimmungen. Prüfen Sie danach Wirksamkeitsdaten und die öffentliche Verfassungszeitleiste.


Prüf- oder Veröffentlichungsrechte allein erlauben keine Bearbeitung. Rollen lassen sich kombinieren. Genaue Rechte: [Rollenreferenz](https://github.com/julianhoelz94/Verfassung/blob/main/docs/editorial-roles.md).

Die Clips sind ohne Ton, zeigen fiktive Daten und getrennte Rollen. Die Schritte oben beschreiben denselben Ablauf.

[[Dokumentationsstart|Home]] · [[English|Editorial-Guide]]

### Einen Verfassungsvorschlag aus dem Chat prüfen

Die private Vorschlagsseite zeigt Quelle, schreibgeschützte Gliederung, das tatsächlich eingereichte Quellenbeispiel und Darstellungseinstellungen. Bitten Sie den verbundenen Chat-Client um Änderungen an der Gliederung. Bei der manuellen Verfassungserstellung bleiben alle Gliederungswerkzeuge erhalten. Bezeichnungen wie **Art.** oder **Artikel** lassen sich hier mit direkter Vorschau ändern, ohne interne Strukturkennungen umzubenennen. Gespeicherte Darstellungswünsche bleiben bei einer Chat-Überarbeitung für gleichbleibende Einheitsarten erhalten.

Unter **Änderungen über den Chat-Client anfordern** können Sie Hinweise speichern. Bitten Sie anschließend den Chat-Client, den Vorschlag erneut über MCP abzurufen. Die Website versendet keine Nachricht automatisch. Eine Überarbeitung zeigt die Änderungen und das vorherige Beispiel zum Vergleich. Laden Sie nach einer Chat-Änderung den aktuellen Vorschlag. Veraltete Speicher- und Bestätigungsversuche werden abgewiesen. Solange eine angeforderte Überarbeitung aussteht, ist die Bestätigung gesperrt.

Wählen Sie nach der Prüfung **Struktur bestätigen und vollständigen Upload ermöglichen**. Der Chat-Client muss auf diese Bestätigung auf der Website warten, bevor er den vollständigen Text hochlädt. Setzen Sie danach die Arbeit im Chat fort; der Client ruft die bestätigten Einstellungen selbst ab. Damit wird nur die Einrichtung bestätigt. Der hochgeladene Text benötigt weiterhin Prüfung, Freigabe und eine ausdrückliche Veröffentlichung.
