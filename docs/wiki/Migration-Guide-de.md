# Eine Archivmigration prüfen

Ein Migrationspaket verbindet Quelleninventar, Originaldateien und Zielzuordnungen. Ein Upload veröffentlicht nichts. Ein Kontoschlüssel mit `mcp:read` und `ingestion:import` darf Inhalte bereitstellen; Vorbereitung, Prüfung und Veröffentlichung erfolgen mit den jeweiligen redaktionellen Rollen auf der Website.

1. Erfassen Sie jede Quelle einschließlich Rahmen, alternativer Ansichten, fehlender und bewusst ausgeschlossener Seiten. Speichern Sie stabile Schlüssel, URLs, Aliase, SHA-256, Kodierung, Herkunft und Ausschlussgründe. `captureKey` verweist auf die Originaldatei; `targetKeys` auf die daraus gewonnenen Ressourcen.
2. Wählen Sie mit `list_jurisdictions` das belegte Gebiet. Regionale und historische Verfassungen verwenden dessen UUID und benötigen keinen erfundenen Ländercode. Geben Sie übergeordnete Gebiete und Existenzdaten nur bei belegtem Zusammenhang an.
3. Lesen Sie `get_import_setup`. Neue Verfassungen benötigen einen Vorschlag mit repräsentativer Strukturprobe und die Bestätigung durch einen Bearbeiter. Vollständige Uploads verwenden die bestätigten Verfassungs- und Einstellungs-IDs.
4. Erstellen oder öffnen Sie mit `create_migration_run` dasselbe Paket. `stage_migration_item` nimmt vollständige Textfassungen, Dokumente/Quellenangaben, Änderungsmetadaten, Verknüpfungen, Alt-URLs und kuratierte Vergleiche auf. Große Ressourcen verwenden den vorhandenen Teilupload mit `migrationRunId` und `item`.
5. Öffnen Sie **Redaktion → Importe → Migrationspakete**. Bereiten Sie Ressourcen als Bearbeiter vor. Fehlende Abhängigkeiten und gescheiterte Versuche bleiben sichtbar und können erneut geprüft werden. Vergleichen Sie die maskierte Originalquelle mit der vorbereiteten Leseransicht. Original-HTML wird als Anhang heruntergeladen und in der Quellenansicht nicht ausgeführt.
6. Lesen Sie sämtliche Seiten von `export_import_job` für die vorbereitete Fassung. Erforderlich sind `complete=true`, beide Vollständigkeitsangaben, keine Abweichungen oder aktiven Validierungsfehler und passende Struktur-/Dokumentzahlen. Die eingereichte Ansicht ist nur der Eingangsbeleg; die vorbereitete Ansicht liest die tatsächlich gespeicherten Daten.
7. Folgen Sie dem Prüfungslink. Ein Prüfer genehmigt nach Quellen- und Linkprüfung. Ein Veröffentlichender mit frischer MFA veröffentlicht die genehmigte Fassung. Originaldateien werden erst durch eine freigegebene öffentliche Beziehung lesbar. Rechtsänderungen und Vergleiche werden gesondert geprüft und veröffentlicht.

Bewahren Sie Schreibweise, Nummerierung, Tabellenzellen, Anmerkungen, Verweisziele und Reihenfolge. Quellenhinweise, redaktionelle Hinweise und Änderungshinweise sind getrennt vom Rechtstext gekennzeichnet. Unsichere Datumsformulierungen, Genauigkeit, Quellenumfang und alte Statusangaben bleiben Quellenbelege; ein unbekannter Wirksamkeitstag bleibt leer. Eine historische Statusangabe behauptet keine heutige Geltung.

## Fortsetzen und nachprüfen

Wiederholungen verwenden dieselben Paket-/Quellenschlüssel und identischen Inhalt. Geänderter Inhalt unter gleichem Schlüssel führt zum Konflikt. `get_migration_run` und `get_migration_attempts` bewahren Abdeckung und Versuche unabhängig vom Ablauf vorübergehender Uploads. Prüfen Sie nach Ablauf zuerst das dauerhafte Paket. Auch nicht verfügbare und ausgeschlossene Quellen gehören zum Nenner der Abdeckung. Teilerfolge behalten ihre nativen IDs und Revisionsbindungen; abweichende Dokumentbindungen oder veränderte Entwürfe erfordern eine ausdrückliche Klärung.

Alt-URLs verweisen auf genaue historische Fassungen, Einheiten, Anmerkungen oder Dokumentrevisionen. Fragmentzuordnungen erfolgen im Browser. Spätere Veröffentlichungen ändern das historische Ziel nicht. Leser finden ein durchsuchbares Änderungsregister mit getrennten Instrument- und Wirksamkeitsdaten sowie kuratierte Vergleiche eigenständiger Verfassungen. Fehlende Entsprechungen bleiben ausdrücklich sichtbar; spätere Textkorrekturen kennzeichnen Prüfbedarf und verändern zitierte Momentaufnahmen nicht.

Der Offline-Browsertest erzeugt einen JSON-Abdeckungsbericht mit synthetischen Testdaten. Tatsächliche Quellenauswahl, Extraktion und historische Bewertung bleiben Aufgabe des Importeurs. Rekonstruktionen aus rechtlichen Änderungssätzen bleiben von VER-46 abhängig; dieser Ablauf importiert vollständig gelieferte Momentaufnahmen.

[[Redaktion|Editorial-Guide-de]] · [[English|Migration-Guide]]
