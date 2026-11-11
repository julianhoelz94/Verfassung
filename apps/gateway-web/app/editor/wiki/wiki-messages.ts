export const wikiUi = {
  title: { en: "Edit the background story", de: "Den Hintergrund erzählen" },
  reviewTitle: {
    en: "Review the background story",
    de: "Den Hintergrund prüfen",
  },
  subtitle: {
    en: "Give readers the context behind the constitution.",
    de: "Gib Lesenden den Kontext hinter der Verfassung.",
  },
  scopeInfo: {
    en: "Wiki drafts, sources and publication are separate from constitutional text and its legal versions.",
    de: "Wiki-Entwürfe, Quellen und Veröffentlichung sind vom Verfassungstext und seinen Rechtsfassungen getrennt.",
  },
  content: { en: "Content", de: "Inhalt" },
  sources: { en: "Sources & media", de: "Quellen & Medien" },
  history: { en: "History", de: "Verlauf" },
  country: { en: "Country Wiki", de: "Länder-Wiki" },
  constitution: { en: "Constitution Wiki", de: "Verfassungs-Wiki" },
  jurisdiction: { en: "Regional Wiki", de: "Regionales Wiki" },
  save: { en: "Save draft", de: "Entwurf speichern" },
  saving: { en: "Saving…", de: "Wird gespeichert…" },
  reviewPublish: { en: "Review & publish", de: "Prüfen & veröffentlichen" },
  review: { en: "Review draft", de: "Entwurf prüfen" },
  publish: { en: "Publish page", de: "Seite veröffentlichen" },
  publishing: { en: "Publishing…", de: "Wird veröffentlicht…" },
  summaryError: {
    en: "Add a short description, up to 500 characters, before saving.",
    de: "Ergänze vor dem Speichern eine Kurzbeschreibung mit höchstens 500 Zeichen.",
  },
  textError: {
    en: "The page text is too long or complex. Use at most 20,000 characters and fewer nested levels. Your edits are preserved.",
    de: "Der Seitentext ist zu lang oder zu stark verschachtelt. Verwende höchstens 20.000 Zeichen und weniger Ebenen. Deine Eingaben bleiben erhalten.",
  },
  imagesError: {
    en: "Add alternative text for each image. A page can contain up to 30 images.",
    de: "Ergänze für jedes Bild einen Alternativtext. Eine Seite kann bis zu 30 Bilder enthalten.",
  },
  pinsError: {
    en: "Use the same document revision for this Wiki’s citations and image. Select at most 100 source documents.",
    de: "Verwende für Belege und Bild dieses Wikis dieselbe Dokumentrevision. Wähle höchstens 100 Quelldokumente aus.",
  },
  sourcesError: {
    en: "Enter up to 20 complete HTTP or HTTPS addresses, one per line.",
    de: "Gib bis zu 20 vollständige HTTP- oder HTTPS-Adressen an, eine pro Zeile.",
  },
  saveError: {
    en: "The Wiki could not be saved. Your entries are still here. Retry, or reload to check for a newer revision.",
    de: "Das Wiki konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten. Versuche es erneut oder lade neu, um eine neuere Revision zu prüfen.",
  },
  documentsError: {
    en: "The draft was saved, but its document pins could not be completed. Retry Save draft to finish without creating a duplicate.",
    de: "Der Entwurf wurde gespeichert, seine Dokumentverknüpfungen konnten jedoch nicht abgeschlossen werden. Wiederhole Entwurf speichern, um den Vorgang ohne Duplikat abzuschließen.",
  },
  publishError: {
    en: "The page could not be published. Check the saved draft and its document revisions, then retry.",
    de: "Die Seite konnte nicht veröffentlicht werden. Prüfe den gespeicherten Entwurf und seine Dokumentrevisionen und versuche es erneut.",
  },
  saved: {
    en: "Draft saved. The published page is unchanged.",
    de: "Entwurf gespeichert. Die veröffentlichte Seite bleibt unverändert.",
  },
  published: { en: "Wiki page published.", de: "Wiki-Seite veröffentlicht." },
  detachCited: {
    en: "This source is cited in the text. Remove its inline references before detaching it.",
    de: "Diese Quelle wird im Text zitiert. Entferne ihre Textbelege, bevor du die Verknüpfung löst.",
  },
  recovery: {
    en: "Retained edits are available from an older saved revision. Recover them to review against the latest draft, or keep the saved draft.",
    de: "Es gibt behaltene Eingaben zu einer älteren gespeicherten Revision. Stelle sie wieder her, um sie mit dem neuesten Entwurf zu prüfen, oder behalte den gespeicherten Entwurf.",
  },
} as const;
