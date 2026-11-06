import type { OutlineKindWrite } from "./api";
import type { UiMessage } from "./messages";

export type ConstitutionTemplate =
  | "articles"
  | "titles"
  | "parts"
  | "sections"
  | "nested-titles";
const kind = (
  kindCode: string,
  displayLabel: string,
  allowedChildKinds: string[] = [],
  options: Partial<OutlineKindWrite> = {},
): OutlineKindWrite => ({
  kindCode,
  displayLabel,
  allowedChildKinds,
  root: false,
  presentation: "section",
  showKind: true,
  showLabel: true,
  showTitle: true,
  titlePolicy: "optional",
  labelPolicy: "optional",
  segmentation: "plain",
  allowTextAlongsideChildren: allowedChildKinds.length > 0,
  labelPlacement: "before_title",
  sentenceDelimiters: [".", "!", "?"],
  ...options,
});
const numbered: Partial<OutlineKindWrite> = {
  showKind: false,
  showTitle: false,
  labelPlacement: "inline",
};
const grouping: Partial<OutlineKindWrite> = {
  allowTextAlongsideChildren: false,
  titlePolicy: "required",
  labelPolicy: "required",
};
const preamble = () =>
  kind("preamble", "Preamble", [], {
    root: true,
    showKind: false,
    showLabel: false,
    labelPolicy: "none",
  });

type Template = {
  id: ConstitutionTemplate;
  title: UiMessage;
  detail: UiMessage;
  source: string;
  create: () => OutlineKindWrite[];
};
/** Presets are data; the same editor and renderer handle every resulting graph. */
export const constitutionTemplates: Template[] = [
  {
    id: "articles",
    title: { en: "Articles and sentences", de: "Artikel und Sätze" },
    detail: {
      en: "Germany · optional chapters, articles, paragraphs and running sentences",
      de: "Deutschland · optionale Kapitel, Artikel, Absätze und Sätze im Fließtext",
    },
    source: "https://www.gesetze-im-internet.de/englisch_gg/englisch_gg.html",
    create: () => [
      preamble(),
      kind("chapter", "Chapter", ["article"], {
        ...grouping,
        root: true,
        showKind: false,
      }),
      kind("article", "Article", ["paragraph", "sentence"], {
        root: true,
        labelPolicy: "required",
      }),
      kind("paragraph", "Paragraph", ["sentence"], numbered),
      kind("sentence", "Sentence", [], {
        ...numbered,
        presentation: "concatenated",
        showLabel: false,
        segmentation: "sentence",
      }),
      kind("appendix", "Appendix", [], { root: true }),
    ],
  },
  {
    id: "titles",
    title: { en: "Titles and paragraphs", de: "Titel und Absätze" },
    detail: {
      en: "France · titles, articles and unnumbered paragraphs",
      de: "Frankreich · Titel, Artikel und unnummerierte Absätze",
    },
    source:
      "https://qpc360.conseil-constitutionnel.fr/constitution-4-octobre-1958",
    create: () => [
      preamble(),
      kind("title", "Title", ["article"], { ...grouping, root: true }),
      kind("article", "Article", ["paragraph"], {
        root: true,
        labelPolicy: "required",
        titlePolicy: "none",
        showTitle: false,
      }),
      kind("paragraph", "Paragraph", [], {
        showKind: false,
        showLabel: false,
        showTitle: false,
        titlePolicy: "none",
        labelPolicy: "none",
      }),
    ],
  },
  {
    id: "parts",
    title: { en: "Parts and chapters", de: "Teile und Kapitel" },
    detail: {
      en: "India · parts, optional chapters, articles and lettered clauses",
      de: "Indien · Teile, optionale Kapitel, Artikel und Untereinheiten",
    },
    source:
      "https://www.legislative.gov.in/static/uploads/2025/07/359f70a69695affb9d72f8393102bd2e.pdf",
    create: () => [
      preamble(),
      kind("part", "Part", ["chapter", "article"], { ...grouping, root: true }),
      kind("chapter", "Chapter", ["article"], grouping),
      kind("article", "Article", ["clause"], { labelPolicy: "required" }),
      kind("clause", "Clause", ["subclause"], numbered),
      kind("subclause", "Subclause", [], numbered),
      kind("schedule", "Schedule", ["clause"], { root: true }),
    ],
  },
  {
    id: "sections",
    title: { en: "Chapters and sections", de: "Kapitel und Sections" },
    detail: {
      en: "South Africa · chapters, sections, subsections and schedules",
      de: "Südafrika · Kapitel, Sections, Subsections und Anhänge",
    },
    source: "https://www.justice.gov.za/legislation/constitution/chp02.html",
    create: () => [
      preamble(),
      kind("chapter", "Chapter", ["section"], { ...grouping, root: true }),
      kind("section", "Section", ["subsection"], {
        showKind: false,
        labelPolicy: "required",
      }),
      kind("subsection", "Subsection", ["paragraph"], numbered),
      kind("paragraph", "Paragraph", [], numbered),
      kind("schedule", "Schedule", ["section"], { root: true }),
    ],
  },
  {
    id: "nested-titles",
    title: {
      en: "Titles, chapters and sections",
      de: "Titel, Kapitel und Abschnitte",
    },
    detail: {
      en: "Spain · titles with optional chapters and sections, articles and separate provisions",
      de: "Spanien · Titel mit optionalen Kapiteln und Abschnitten, Artikel und separate Bestimmungen",
    },
    source: "https://boe.es/buscar/act.php?id=BOE-A-1978-31229",
    create: () => [
      preamble(),
      kind("title", "Title", ["chapter", "article"], {
        ...grouping,
        root: true,
      }),
      kind("chapter", "Chapter", ["section", "article"], grouping),
      kind("section", "Section", ["article"], grouping),
      kind("article", "Article", ["paragraph"], {
        labelPolicy: "required",
        titlePolicy: "none",
        showTitle: false,
      }),
      kind("paragraph", "Paragraph", [], numbered),
      kind("provision", "Provision", ["paragraph"], { root: true }),
    ],
  },
];
export function outlineFromTemplate(
  template: ConstitutionTemplate,
): OutlineKindWrite[] {
  return (
    constitutionTemplates.find((item) => item.id === template) ??
    constitutionTemplates[0]
  ).create();
}
