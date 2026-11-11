import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WikiRichText } from "./WikiRichText";
import { WikiInlineCitation } from "./WikiInlineCitation";
import { WikiContent } from "../WikiContent";
import { TranslationProvider } from "../TranslationProvider";
import { legacyWikiDocument, type WikiNode } from "../../../lib/wiki-document";

const reference = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  revision: 2,
  locator: "p. 42",
};
const citations = [
  { documentId: reference.documentId, revision: 2, title: "Archival source", citationNote: "Original source note" },
];
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true,
    value: function (this: HTMLElement) {
      this.dataset.open = "true";
    },
  });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", {
    configurable: true,
    value: function (this: HTMLElement) {
      delete this.dataset.open;
    },
  });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (
    this: HTMLElement,
    value: string,
  ) {
    return value === ":popover-open"
      ? this.dataset.open === "true"
      : matches.call(this, value);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it("renders all rich blocks with safe text and only allowed marks/colors", () => {
  const document: WikiNode = {
    type: "doc",
    content: [1, 2, 3].map((level) => ({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text: `Heading ${level}` }],
    })),
  };
  document.content!.push({
    type: "blockquote",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "<script>literal</script>",
            marks: [
              { type: "strong" },
              { type: "em" },
              { type: "underline" },
              { type: "text_color", attrs: { color: "#355a47" } },
            ],
          },
          { type: "hard_break" },
          { type: "citation", attrs: { reference } },
        ],
      },
    ],
  });
  document.content!.push({
    type: "ordered_list",
    attrs: { order: 3 },
    content: [
      {
        type: "list_item",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First" }] },
        ],
      },
    ],
  });
  document.content!.push({
    type: "bullet_list",
    content: [
      {
        type: "list_item",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Bullet" }] },
        ],
      },
    ],
  });
  const html = renderToStaticMarkup(
    <WikiRichText document={document} citations={citations} />,
  );
  host.innerHTML = html;
  expect(host.querySelector("h3")?.textContent).toBe("Heading 1");
  expect(host.querySelector("h4")).toBeTruthy();
  expect(host.querySelector("h5")).toBeTruthy();
  expect(host.querySelector("blockquote strong")?.textContent).toBe(
    "<script>literal</script>",
  );
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector("blockquote em")).toBeTruthy();
  expect(host.querySelector("blockquote u")).toBeTruthy();
  expect(host.querySelector("br")).toBeTruthy();
  expect(host.querySelector("ol")?.start).toBe(3);
  expect(host.querySelector("ul li")?.textContent).toBe("Bullet");
  expect(html).toContain("Citation 1: Archival source");
});
it("shares inline numbering and supplementary bibliography in the final content template", () => {
  const bodyDocument = legacyWikiDocument("Text");
  bodyDocument.content![0].content!.push(
    { type: "citation", attrs: { reference } },
    {
      type: "citation",
      attrs: {
        reference: { ...reference, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      },
    },
  );
  const html = renderToStaticMarkup(
    <WikiContent
      page={{
        summary: "Summary",
        body: "Legacy",
        bodyDocument,
        citations: [
          ...citations,
          {
            documentId: "other",
            revision: 1,
            title: "Additional source",
            citationNote: "Chapter 1",
          },
        ],
        images: [],
        sourceUrls: ["https://example.org/source"],
      }}
    />,
  );
  host.innerHTML = html;
  expect(host.querySelectorAll("sup button")).toHaveLength(2);
  expect(host.querySelectorAll("ol li")).toHaveLength(1);
  expect(html).toContain("Additional source");
  expect(html).toContain("Chapter 1");
  expect(html).toContain("Original source note");
  expect(html).toContain("Page sources");
  expect(html).not.toContain("Legacy");
});
it("opens exact revision details, returns focus on Escape, and closes outside or on native toggle", async () => {
  await act(async () =>
    root.render(
      <TranslationProvider locale="de">
        <WikiInlineCitation reference={reference} number={1} title="Archive" />
      </TranslationProvider>,
    ),
  );
  const trigger = getByRole(host, "button", {
    name: "Beleg 1: Archive · p. 42",
  });
  await act(async () => fireEvent.click(trigger));
  const dialog = getByRole(host, "dialog", { name: "Zitierte Quelle" });
  expect(
    getByRole(dialog, "link", { name: "Dokument öffnen" }).getAttribute("href"),
  ).toBe(`/documents/${reference.documentId}?revision=2`);
  await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
  expect(document.activeElement).toBe(trigger);
  await act(async () => fireEvent.click(trigger));
  await act(async () => fireEvent.keyDown(trigger, { key: "Escape" }));
  expect(queryByRole(host, "dialog")).toBeNull();
  await act(async () => fireEvent.click(trigger));
  await act(async () => fireEvent.pointerDown(document.body));
  expect(queryByRole(host, "dialog")).toBeNull();
  await act(async () => fireEvent.click(trigger));
  await act(async () =>
    fireEvent.click(
      getByRole(host, "button", { name: "Schließen", exact: true }),
    ),
  );
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
