import { describe, expect, it } from "vitest";
import {
  legacyWikiDocument,
  mergeWikiReferences,
  readWikiDocument,
  wikiCitationIndex,
  wikiPlainBody,
  wikiTextColors,
  type WikiNode,
} from "./wiki-document";

const documentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reference = (id: string, locator = "p. 12", revision = 2): WikiNode => ({
  type: "citation",
  attrs: { reference: { id, documentId, revision, locator } },
});
const one = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  two = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  three = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const document = (content: WikiNode[]): WikiNode => ({
  type: "doc",
  content: [{ type: "paragraph", content }],
});
describe("Wiki rich document contracts", () => {
  it("round-trips existing paragraph, heading, line-break and list text", () => {
    const body =
      "# History\n\nA line\nand another.\n\n- First\n- Second\n\n### Detail";
    expect(wikiPlainBody(readWikiDocument(legacyWikiDocument(body))!)).toBe(
      body,
    );
    expect(readWikiDocument(null)).toBeNull();
    expect(readWikiDocument("")).toBeNull();
    expect(wikiPlainBody(legacyWikiDocument(""))).toBe("");
  });
  it("numbers references by first appearance and deduplicates matching pins and locators", () => {
    const body = document([
      reference(one),
      reference(two),
      reference(three, "p. 14"),
    ]);
    expect(readWikiDocument(body)).toEqual(body);
    const index = wikiCitationIndex(body);
    expect(index.entries.map((item) => item.number)).toEqual([1, 2]);
    expect(index.numbers).toEqual({ [one]: 1, [two]: 1, [three]: 2 });
    expect(wikiPlainBody(body)).toBe("");
    expect(mergeWikiReferences([], body)).toEqual([
      { documentId, revision: 2 },
    ]);
    expect(() =>
      mergeWikiReferences([{ documentId, revision: 3 }], body),
    ).toThrow("Conflicting");
  });
  it("accepts the supported formatting palette and preserves literal authored markup", () => {
    for (const color of wikiTextColors) {
      const body = document([
        {
          type: "text",
          text: "<b>literal</b>",
          marks: [
            { type: "strong" },
            { type: "em" },
            { type: "underline" },
            { type: "text_color", attrs: { color: color.value } },
          ],
        },
      ]);
      expect(wikiPlainBody(readWikiDocument(JSON.stringify(body))!)).toBe(
        "<b>literal</b>",
      );
    }
  });
  it("rejects unexpected HTML, attributes, malformed nodes, marks and pins", () => {
    const invalid: unknown[] = [
      false,
      [],
      { type: "doc", content: [] },
      document([{ type: "html", text: "<script>x</script>" }]),
      document([{ type: "text", text: "" }]),
      document([
        {
          type: "text",
          text: "x",
          marks: [{ type: "strong" }, { type: "strong" }],
        },
      ]),
      document([reference(one), reference(one)]),
      document([reference(one), reference(two, "", 3)]),
      { type: "doc", content: [{ type: "heading", attrs: { level: 4 } }] },
      {
        type: "doc",
        content: [{ type: "list_item", content: [{ type: "paragraph" }] }],
      },
      document([
        {
          type: "text",
          text: "x",
          marks: [
            { type: "text_color", attrs: { color: "red;position:fixed" } },
          ],
        },
      ]),
    ];
    for (const value of invalid)
      expect(() => readWikiDocument(value)).toThrow();
    expect(() =>
      readWikiDocument({ ...document([]), html: "<script>" }),
    ).toThrow();
    expect(() =>
      readWikiDocument(document([{ type: "text", text: "x".repeat(20001) }])),
    ).toThrow("long");
    let child: WikiNode = { type: "paragraph" };
    for (let index = 0; index < 14; index++)
      child = { type: "blockquote", content: [child] };
    expect(() => readWikiDocument({ type: "doc", content: [child] })).toThrow(
      "complex",
    );
  });
});
