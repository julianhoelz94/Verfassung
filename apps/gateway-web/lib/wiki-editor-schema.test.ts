import { DOMParser, DOMSerializer } from "prosemirror-model";
import { describe, expect, it } from "vitest";
import { wikiSchema } from "./wiki-editor-schema";
import {
  readWikiDocument,
  wikiCitationIndex,
  wikiPlainBody,
  wikiTextColors,
} from "./wiki-document";
function parse(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  return DOMParser.fromSchema(wikiSchema).parse(host);
}
function serialize(html: string) {
  const node = parse(html),
    host = document.createElement("div");
  host.append(
    DOMSerializer.fromSchema(wikiSchema).serializeFragment(node.content),
  );
  return { node, html: host.innerHTML };
}

describe("Wiki clipboard grammar", () => {
  it("preserves supported typography, nested lists, quotes and line breaks in its stored grammar", () => {
    const { node, html } = serialize(
      '<h3>One</h3><h4>Two</h4><h5>Three</h5><blockquote><p>Quoted<br>line</p></blockquote><ol start="3"><li><p>First</p><ul><li>Nested</li></ul></li></ol><p><b>Bold</b><i>Italic</i><u>Underlined</u><span style="font-weight:600;font-style:italic;text-decoration:underline">CSS</span></p>',
    );
    expect(html).toContain('<ol start="3">');
    expect(html).toContain("<blockquote>");
    expect(html).toContain(
      "<strong>Bold</strong><em>Italic</em><u>Underlined</u>",
    );
    expect(readWikiDocument(node.toJSON())).toBeTruthy();
    expect(wikiPlainBody(node.toJSON())).toContain("3. First");
  });
  it("normalizes each palette color, drops unsupported color/HTML, and retains literal text", () => {
    for (const color of wikiTextColors) {
      const { node, html } = serialize(
        `<p><span style="color:${color.value}">Ink</span></p>`,
      );
      expect(node.firstChild?.firstChild?.marks[0].attrs.color).toBe(
        color.value,
      );
      expect(html).toContain("color:");
    }
    const { node, html } = serialize(
      '<p><span style="color:red" onclick="alert(1)">Literal &lt;script&gt;</span></p>',
    );
    expect(node.firstChild?.firstChild?.marks).toEqual([]);
    expect(html).not.toContain("onclick");
    expect(html).toContain("&lt;script&gt;");
    expect(
      serialize('<p><b style="font-weight:normal">Plain</b></p>').node
        .firstChild?.firstChild?.marks,
    ).toEqual([]);
  });
  it("copies citation pins and creates independent occurrence IDs on each paste", () => {
    const reference = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      revision: 2,
      locator: "p. 42",
    };
    const node = wikiSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { reference } }],
        },
      ],
    });
    const host = document.createElement("div");
    host.append(
      DOMSerializer.fromSchema(wikiSchema).serializeFragment(node.content),
    );
    const pasted = parse(host.innerHTML + host.innerHTML),
      refs = wikiCitationIndex(pasted.toJSON()).references;
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      documentId: reference.documentId,
      revision: 2,
      locator: "p. 42",
    });
    expect(refs[0].id).not.toBe(refs[1].id);
    expect(refs[0].id).not.toBe(reference.id);
    expect(readWikiDocument(pasted.toJSON())).toBeTruthy();
    expect(wikiCitationIndex(pasted.toJSON()).entries).toHaveLength(1);
    expect(
      parse(
        '<p><sup data-wiki-citation="broken">bad</sup><sup data-wiki-citation="null">none</sup></p>',
      ).textContent,
    ).toBe("badnone");
  });
});
