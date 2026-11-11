import type { DocumentReference } from "./document-reference";

export type WikiInlineReference = Pick<
  DocumentReference,
  "documentId" | "revision"
> & {
  id: string;
  locator: string;
};
export type WikiMark = {
  type: "strong" | "em" | "underline" | "text_color";
  attrs?: { color: string };
};
export type WikiNode = {
  type: string;
  attrs?: { level?: number; order?: number; reference?: WikiInlineReference };
  text?: string;
  marks?: WikiMark[];
  content?: WikiNode[];
};
export type WikiWritingValue = { body: string; bodyDocument?: WikiNode | null };
export type WikiCitation = DocumentReference & { title: string };
export const wikiTextColors = [
  { name: { en: "Default ink", de: "Standardfarbe" }, value: "#25332f" },
  { name: { en: "Forest green", de: "Waldgrün" }, value: "#355a47" },
  { name: { en: "Slate blue", de: "Schieferblau" }, value: "#345b78" },
  { name: { en: "Burgundy", de: "Burgunder" }, value: "#824b45" },
  { name: { en: "Deep ochre", de: "Dunkles Ocker" }, value: "#795719" },
  { name: { en: "Plum", de: "Pflaume" }, value: "#66517d" },
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blocks = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bullet_list",
  "ordered_list",
]);
const inlines = new Set(["text", "hard_break", "citation"]);
const plainMarks = new Set(["strong", "em", "underline"]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid Wiki document object");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TypeError("Unknown Wiki document field");
}
function integer(value: unknown, min: number, max: number) {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}
function reference(value: unknown): WikiInlineReference {
  const ref = object(value);
  keys(ref, ["id", "documentId", "revision", "locator"]);
  if (
    typeof ref.id !== "string" ||
    !uuid.test(ref.id) ||
    typeof ref.documentId !== "string" ||
    !uuid.test(ref.documentId) ||
    !integer(ref.revision, 1, 2147483647) ||
    typeof ref.locator !== "string" ||
    ref.locator.length > 4000
  )
    throw new TypeError("Invalid Wiki citation");
  return {
    id: ref.id,
    documentId: ref.documentId,
    revision: Number(ref.revision),
    locator: ref.locator,
  };
}
function mark(value: unknown): WikiMark {
  const item = object(value);
  keys(item, ["type", "attrs"]);
  if (typeof item.type !== "string")
    throw new TypeError("Invalid Wiki text mark");
  if (plainMarks.has(item.type) && item.attrs === undefined)
    return { type: item.type as WikiMark["type"] };
  const attrs = object(item.attrs);
  keys(attrs, ["color"]);
  if (
    item.type !== "text_color" ||
    !wikiTextColors.some((color) => color.value === attrs.color)
  )
    throw new TypeError("Invalid Wiki text color");
  return { type: "text_color", attrs: { color: String(attrs.color) } };
}

function allowedChildren(parent: string): Set<string> {
  if (!parent) return new Set(["doc"]);
  if (["doc", "blockquote", "list_item"].includes(parent)) return blocks;
  if (["bullet_list", "ordered_list"].includes(parent))
    return new Set(["list_item"]);
  return inlines;
}
function readTextNode(item: Record<string, unknown>): WikiNode {
  if (
    typeof item.text !== "string" ||
    !item.text.length ||
    item.content !== undefined ||
    item.attrs !== undefined
  )
    throw new TypeError("Invalid Wiki text");
  const result: WikiNode = { type: "text", text: item.text };
  if (item.marks !== undefined) {
    if (!Array.isArray(item.marks) || item.marks.length > 4)
      throw new TypeError("Invalid Wiki text marks");
    result.marks = item.marks.map(mark);
    if (
      new Set(result.marks.map((item) => item.type)).size !==
      result.marks.length
    )
      throw new TypeError("Duplicate Wiki text mark");
  }
  return result;
}
function readChildren(item: Record<string, unknown>, type: string): unknown[] {
  const content = item.content ?? [];
  if (
    !Array.isArray(content) ||
    (["doc", "blockquote", "bullet_list", "ordered_list", "list_item"].includes(
      type,
    ) &&
      !content.length)
  )
    throw new TypeError("Missing Wiki content");
  if (type === "list_item" && object(content[0]).type !== "paragraph")
    throw new TypeError("List items start with a paragraph");
  return content;
}

/** A bounded, explicit document grammar is shared by the editor, actions and viewer. */
export function readWikiDocument(input: unknown): WikiNode | null {
  const value: unknown =
    typeof input === "string" ? JSON.parse(input || "null") : input;
  if (value == null) return null;
  if (JSON.stringify(value).length > 200000)
    throw new TypeError("Wiki document is too large");
  let count = 0;
  const ids = new Set<string>(),
    pins = new Map<string, number>();
  function attrs(
    item: Record<string, unknown>,
    type: string,
  ): WikiNode["attrs"] {
    if (type === "citation") {
      const data = object(item.attrs);
      keys(data, ["reference"]);
      const ref = reference(data.reference);
      if (
        ids.size >= 1000 ||
        ids.has(ref.id) ||
        (pins.has(ref.documentId) && pins.get(ref.documentId) !== ref.revision)
      )
        throw new TypeError("Conflicting Wiki citation");
      ids.add(ref.id);
      pins.set(ref.documentId, ref.revision);
      return { reference: ref };
    }
    if (type === "heading" || type === "ordered_list") {
      const data = object(item.attrs),
        key = type === "heading" ? "level" : "order";
      keys(data, [key]);
      if (!integer(data[key], 1, type === "heading" ? 3 : 100000))
        throw new TypeError("Invalid Wiki block attributes");
      return { [key]: Number(data[key]) };
    }
    if (item.attrs !== undefined)
      throw new TypeError("Unexpected Wiki attributes");
    return undefined;
  }
  function node(raw: unknown, parent: string, depth: number): WikiNode {
    if (++count > 5000 || depth > 12)
      throw new TypeError("Wiki document is too complex");
    const item = object(raw);
    keys(item, ["type", "attrs", "text", "marks", "content"]);
    const type = item.type;
    if (typeof type !== "string" || !allowedChildren(parent).has(type))
      throw new TypeError("Invalid Wiki document structure");
    if (type === "text") return readTextNode(item);
    if (item.text !== undefined || item.marks !== undefined)
      throw new TypeError("Invalid Wiki block");
    const result: WikiNode = { type },
      attributes = attrs(item, type);
    if (attributes) result.attrs = attributes;
    if (type === "citation" || type === "hard_break") {
      if (item.content !== undefined)
        throw new TypeError("Invalid Wiki inline content");
    } else {
      const content = readChildren(item, type);
      result.content = content.map((child) => node(child, type, depth + 1));
    }
    return result;
  }
  const document = node(value, "", 0);
  if (wikiPlainBody(document).length > 20000)
    throw new TypeError("Wiki text is too long");
  return document;
}

export function legacyWikiDocument(body: string): WikiNode {
  const inline = (text: string): WikiNode[] =>
    text
      .split("\n")
      .flatMap((line, index) => [
        ...(index ? [{ type: "hard_break" }] : []),
        ...(line ? [{ type: "text", text: line }] : []),
      ]);
  const content = body
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = !block.includes("\n") && /^(#{1,3})\s+(.+)$/.exec(block);
      if (heading)
        return {
          type: "heading",
          attrs: { level: heading[1].length },
          content: inline(heading[2]),
        };
      const lines = block.split("\n");
      if (lines.every((line) => /^-\s+/.test(line)))
        return {
          type: "bullet_list",
          content: lines.map((line) => ({
            type: "list_item",
            content: [
              { type: "paragraph", content: inline(line.replace(/^-\s+/, "")) },
            ],
          })),
        };
      return { type: "paragraph", content: inline(block) };
    });
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}
export function wikiPlainBody(document: WikiNode): string {
  const text = (node: WikiNode): string =>
    node.type === "citation"
      ? ""
      : node.type === "text"
        ? (node.text ?? "")
        : node.type === "hard_break"
          ? "\n"
          : (node.content ?? []).map(text).join("");
  function block(node: WikiNode): string {
    if (node.type === "heading")
      return `${"#".repeat(node.attrs?.level ?? 1)} ${text(node)}`;
    if (node.type === "paragraph") return text(node);
    if (node.type === "bullet_list" || node.type === "ordered_list")
      return (node.content ?? [])
        .map(
          (item, index) =>
            `${node.type === "ordered_list" ? `${index + (node.attrs?.order ?? 1)}.` : "-"} ${(item.content ?? []).map(block).join("\n")}`,
        )
        .join("\n");
    return (node.content ?? []).map(block).join("\n\n");
  }
  return block(document).trim();
}
export function wikiCitationIndex(document?: WikiNode | null) {
  const entries: { reference: WikiInlineReference; number: number }[] = [],
    references: WikiInlineReference[] = [];
  const numbers: Record<string, number> = {},
    keys = new Map<string, number>();
  function visit(node: WikiNode) {
    const ref = node.type === "citation" ? node.attrs?.reference : undefined;
    if (ref) {
      const key = JSON.stringify([
        ref.documentId,
        ref.revision,
        ref.locator.trim(),
      ]);
      let number = keys.get(key);
      if (!number) {
        number = entries.length + 1;
        keys.set(key, number);
        entries.push({ reference: ref, number });
      }
      numbers[ref.id] = number;
      references.push(ref);
    }
    node.content?.forEach(visit);
  }
  if (document) visit(document);
  return { entries, numbers, references };
}
/** Inline occurrences have locators; the document relationship has one immutable pin. */
export function mergeWikiReferences(
  references: DocumentReference[],
  document?: WikiNode | null,
): DocumentReference[] {
  const pins = new Map(references.map((ref) => [ref.documentId, ref]));
  for (const ref of wikiCitationIndex(document).references) {
    if (
      pins.has(ref.documentId) &&
      pins.get(ref.documentId)!.revision !== ref.revision
    )
      throw new TypeError("Conflicting Wiki document revision");
    if (!pins.has(ref.documentId))
      pins.set(ref.documentId, {
        documentId: ref.documentId,
        revision: ref.revision,
      });
  }
  if (pins.size > 100) throw new TypeError("Too many Wiki sources");
  return [...pins.values()];
}
