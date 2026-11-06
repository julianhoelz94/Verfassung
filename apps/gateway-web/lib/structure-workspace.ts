import type { UiMessage } from "./messages";

export const structureUi = {
  historyUnavailable: {
    en: "Previous settings could not be loaded. Reload this page to try again.",
    de: "Vorherige Einstellungen konnten nicht geladen werden. Lade die Seite erneut, um es noch einmal zu versuchen.",
  },
  restoreDraft: { en: "Restore as draft", de: "Als Entwurf wiederherstellen" },
  previous: { en: "Previous settings", de: "Vorherige Einstellungen" },
  restoreHelp: {
    en: "Restore these settings as an unsaved draft, then review their impact before saving.",
    de: "Übernimm diese Einstellungen als ungespeicherten Entwurf und prüfe vor dem Speichern die Auswirkungen.",
  },
  documentsAfterCreate: {
    en: "Create the constitution first, then upload or link documents in its settings.",
    de: "Erstelle zuerst die Verfassung. Anschließend kannst du in ihren Einstellungen Dokumente hochladen oder verknüpfen.",
  },
  cancel: { en: "Cancel", de: "Abbrechen" },
  structure: { en: "Structure", de: "Struktur" },
  editing: { en: "Editing", de: "Bearbeitung" },
  display: { en: "Display", de: "Darstellung" },
  levels: { en: "Levels", de: "Ebenen" },
  preview: { en: "Preview", de: "Vorschau" },
  example: { en: "Illustrative text", de: "Beispieltext" },
  sourceSample: { en: "Source sample", de: "Quellbeispiel" },
  review: { en: "Review", de: "Prüfung" },
  impact: { en: "Review impact", de: "Auswirkungen prüfen" },
  documents: { en: "Documents", de: "Dokumente" },
  history: { en: "History", de: "Verlauf" },
  proposal: { en: "Proposal", de: "Vorschlag" },
  changes: { en: "Changes", de: "Änderungen" },
  templates: { en: "Templates", de: "Vorlagen" },
  top: {
    en: "May appear at the top level",
    de: "Kann auf der obersten Ebene stehen",
  },
  root: { en: "Top level", de: "Oberste Ebene" },
  leaf: { en: "Contains text", de: "Enthält Text" },
  parent: { en: "Structural level", de: "Strukturebene" },
  topHelp: {
    en: "Units of this kind may appear directly under the constitution, without a parent. They may also be allowed inside another kind.",
    de: "Einheiten dieser Art dürfen direkt unter der Verfassung stehen, ohne übergeordnete Einheit. Sie können zusätzlich innerhalb einer anderen Art erlaubt sein.",
  },
  levelsHelp: {
    en: "Indentation follows allowed parent–child relationships. A kind can appear along several paths. These paths are permissions, not compulsory levels in every article.",
    de: "Die Einrückung folgt den erlaubten Eltern-Kind-Beziehungen. Eine Art kann an mehreren Stellen vorkommen. Diese Verbindungen sind erlaubt, nicht für jeden Artikel vorgeschrieben.",
  },
  technical: { en: "Technical identity", de: "Technische Identität" },
  code: { en: "Kind code", de: "Art-Code" },
  name: { en: "Reader-facing name", de: "Name in der Leseansicht" },
  titles: { en: "Unit headings", de: "Überschriften" },
  labels: { en: "Numbers / identifiers", de: "Nummern / Kennzeichen" },
  showTitle: { en: "Show heading", de: "Überschrift anzeigen" },
  showLabel: {
    en: "Show number / identifier",
    de: "Nummer / Kennzeichen anzeigen",
  },
  labelHelp: {
    en: "A value entered as text, such as 3, 46a, (2a), IV or a). It is displayed exactly as entered and is not automatically numbered.",
    de: "Ein als Text eingegebener Wert, etwa 3, 46a, (2a), IV oder a). Er wird unverändert angezeigt und nicht automatisch vergeben.",
  },
  titleHelp: {
    en: "An individual unit heading, such as Equal rights in Article 3 — Equal rights. It is separate from the kind name, number and wording.",
    de: "Die individuelle Überschrift einer Einheit, etwa Gleichheit vor dem Gesetz in Artikel 3 — Gleichheit vor dem Gesetz. Sie ist ein eigenes Feld neben Art-Bezeichnung, Nummer und Wortlaut.",
  },
  placement: {
    en: "Number / identifier placement",
    de: "Position der Nummer / des Kennzeichens",
  },
  actions: { en: "Level actions", de: "Aktionen für Ebene" },
  editDisplay: { en: "Edit display", de: "Darstellung bearbeiten" },
  newLevel: { en: "New level", de: "Neue Ebene" },
  addRoot: {
    en: "Add at the top level",
    de: "Auf der obersten Ebene hinzufügen",
  },
  addChild: { en: "Add child under", de: "Unterebene hinzufügen zu" },
  between: { en: "Insert between", de: "Ebene einfügen zwischen" },
  and: { en: "and", de: "und" },
  connect: {
    en: "Connect to a parent level",
    de: "Mit übergeordneter Ebene verbinden",
  },
  connectSave: { en: "Connect level", de: "Ebene verbinden" },
  parentLevel: { en: "Parent level", de: "Übergeordnete Ebene" },
  connectionHelp: {
    en: "Existing connections remain allowed. This adds another parent–child relationship.",
    de: "Bestehende Verbindungen bleiben erlaubt. Eine Eltern-Kind-Beziehung wird ergänzt.",
  },
  disconnected: { en: "Not connected", de: "Nicht verbunden" },
  disconnectedHelp: {
    en: "This kind has no path from a top-level kind. Use the level menu to connect it to a parent or remove it if unused. Under Structure, you can also allow it at the top level. Connect every kind before saving.",
    de: "Diese Art ist mit keiner obersten Ebene verbunden. Verbinde sie über das Ebenenmenü mit einer übergeordneten Ebene oder entferne sie, falls sie nicht benötigt wird. Unter Struktur kannst du sie auch auf der obersten Ebene erlauben. Vor dem Speichern müssen alle Arten verbunden sein.",
  },
  cycle: {
    en: "The hierarchy must not contain a cycle.",
    de: "Die Hierarchie darf keinen Kreis enthalten.",
  },
  unreachable: {
    en: "Connect every kind to a top-level kind before saving.",
    de: "Verbinde jede Art mit einer obersten Ebene, bevor du speicherst.",
  },
  request: { en: "Request changes", de: "Änderungen anfordern" },
  restricted: {
    en: "Structure and editing rules come from the import proposal. Request corrections from the importer.",
    de: "Struktur und Bearbeitungsregeln stammen aus dem Importvorschlag. Fordere Korrekturen beim Importeur an.",
  },
  chooseTemplate: {
    en: "Choose a starting structure",
    de: "Strukturvorlage wählen",
  },
  templateHelp: {
    en: "Based on real constitutions. Every setting remains editable.",
    de: "Nach realen Verfassungen gestaltet. Alle Einstellungen bleiben anpassbar.",
  },
  reference: {
    en: "Official structural reference",
    de: "Offizielles Strukturbeispiel",
  },
  useTemplate: { en: "Use this template", de: "Vorlage verwenden" },
  kindTerm: { en: "Kind name of the level", de: "Art-Bezeichnung der Ebene" },
  labelTerm: {
    en: "Number / identifier of the level",
    de: "Nummer / Kennzeichen der Ebene",
  },
  titleTerm: { en: "Heading of the level", de: "Überschrift der Ebene" },
} satisfies Record<string, UiMessage>;
