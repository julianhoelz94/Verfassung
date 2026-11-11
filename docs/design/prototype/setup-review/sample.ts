import type {
  OrderedNode,
  OutlineKindWrite,
} from "../../../../apps/gateway-web/lib/api";
import type { DocumentRecord } from "../../../../apps/gateway-web/lib/document-api";

export const title = "Grundgesetz für die Bundesrepublik Deutschland";
export const kinds: OutlineKindWrite[] = [
  {
    kindCode: "chapter",
    displayLabel: "Abschnitt",
    root: true,
    allowedChildKinds: ["article"],
    titlePolicy: "required",
    labelPolicy: "required",
    segmentation: "plain",
    presentation: "section",
    showKind: false,
    showLabel: true,
    showTitle: true,
    allowTextAlongsideChildren: false,
    labelPlacement: "before_title",
  },
  {
    kindCode: "article",
    displayLabel: "Artikel",
    root: false,
    allowedChildKinds: ["paragraph"],
    titlePolicy: "optional",
    labelPolicy: "required",
    segmentation: "plain",
    presentation: "section",
    showKind: true,
    showLabel: true,
    showTitle: false,
    allowTextAlongsideChildren: false,
    labelPlacement: "before_title",
  },
  {
    kindCode: "paragraph",
    displayLabel: "Absatz",
    root: false,
    allowedChildKinds: [],
    titlePolicy: "none",
    labelPolicy: "optional",
    segmentation: "plain",
    presentation: "concatenated",
    showKind: false,
    showLabel: true,
    showTitle: false,
    allowTextAlongsideChildren: false,
    labelPlacement: "superscript",
  },
];
function unit(
  id: string,
  kind: string,
  label: string,
  title: string,
  children: OrderedNode[] = [],
  text?: string,
): OrderedNode {
  return {
    logicalId: id,
    occurrenceId: id,
    revisionId: `${id}-r1`,
    kind,
    label,
    title,
    content: text
      ? [
          {
            type: "text",
            logicalId: `${id}-text`,
            occurrenceId: `${id}-text`,
            text,
          },
        ]
      : children.map((node) => ({ type: "child", node })),
  };
}
export const sampleRoots = [
  unit("chapter-i", "chapter", "I.", "Die Grundrechte", [
    unit("article-1", "article", "1", "", [
      unit(
        "paragraph-1",
        "paragraph",
        "(1)",
        "",
        [],
        "Die Würde des Menschen ist unantastbar. Sie zu achten und zu schützen ist Verpflichtung aller staatlichen Gewalt.",
      ),
      unit(
        "paragraph-2",
        "paragraph",
        "(2)",
        "",
        [],
        "Das Deutsche Volk bekennt sich darum zu unverletzlichen und unveräußerlichen Menschenrechten als Grundlage jeder menschlichen Gemeinschaft, des Friedens und der Gerechtigkeit in der Welt.",
      ),
    ]),
    unit("article-2", "article", "2", "", [
      unit(
        "paragraph-3",
        "paragraph",
        "(1)",
        "",
        [],
        "Jeder hat das Recht auf die freie Entfaltung seiner Persönlichkeit, soweit er nicht die Rechte anderer verletzt und nicht gegen die verfassungsmäßige Ordnung oder das Sittengesetz verstößt.",
      ),
    ]),
  ]),
];
export const folders = [
  { id: "germany", name: "Deutschland", tagId: "germany" },
];
export function document(
  id: string,
  title: string,
  key: string,
  year: string,
): DocumentRecord {
  return {
    id,
    citationKey: key,
    currentRevision: 2,
    status: "active",
    createdAt: "2026-11-01",
    tags: [{ id: "germany", name: "Deutschland" }],
    revision: {
      id: `${id}-r2`,
      documentId: id,
      revision: 2,
      title,
      citationKey: key,
      fileName: `${key}.pdf`,
      contentType: "application/pdf",
      sourceUrl: "https://example.org/source",
      description: "Beispieldatensatz für den interaktiven Entwurf.",
      createdAt: "2026-11-01",
      createdBy: "preview",
      bibliography: {
        type: "report",
        authors: [{ literal: "Parlamentarischer Rat" }],
        editors: [],
        issued: year,
        publisher: "Beispielarchiv",
        extra: {},
      },
      attachments: [],
    },
  };
}
export const documents = [
  document(
    "gazette",
    "Bundesgesetzblatt · Verkündung des Grundgesetzes",
    "BGBl1949",
    "1949",
  ),
  document(
    "structure",
    "Hinweise zur Gliederung des Grundgesetzes",
    "GliederungGG",
    "2025",
  ),
  document(
    "archive",
    "Archivnachweis · Ursprüngliche Fassung 1949",
    "ArchivGG1949",
    "1949",
  ),
];
