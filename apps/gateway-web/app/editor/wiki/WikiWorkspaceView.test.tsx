import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  fireEvent,
  getByRole,
  getByLabelText,
  queryByRole,
  within,
} from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiPageRevision } from "../../../lib/api";
import type { WikiEditorTemplateProps } from "../../components/WikiEditorTemplate";
import { WikiWorkspaceView } from "./WikiWorkspaceView";
import { TranslationProvider } from "../../components/TranslationProvider";
import { legacyWikiDocument } from "../../../lib/wiki-document";

const owner = {
  targetType: "country" as const,
  targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  code: "DE",
};
const documentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const citation = {
  documentId,
  revision: 2,
  title: "Archive report",
  citationNote: "Chapter 3",
};
const initial: WikiPageRevision = {
  id: "wiki-one",
  targetType: "country",
  targetId: owner.targetId,
  predecessorId: null,
  summary: "Original context",
  body: "Original text",
  images: [],
  sourceUrls: [],
  citations: [citation],
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "author",
  publishedAt: null,
};
const record = {
  id: documentId,
  currentRevision: 2,
  status: "active",
  revision: {
    id: "document-pin",
    documentId,
    revision: 2,
    title: citation.title,
    sourceUrl: "https://example.org/report",
    contentType: "application/pdf",
    fileName: null,
  },
  createdAt: "2026-01-01",
};
let host: HTMLDivElement, root: Root, props: WikiEditorTemplateProps;
const save = vi.fn(),
  publish = vi.fn();
const click = async (name: string, scope: HTMLElement = host) =>
  act(async () => {
    fireEvent.click(getByRole(scope, "button", { name, exact: true }));
  });
const change = async (name: string, value: string) =>
  act(async () => {
    fireEvent.change(getByLabelText(host, name, { exact: false }), {
      target: { value },
    });
  });
async function render(overrides: Partial<WikiEditorTemplateProps> = {}) {
  props = { ...props, ...overrides };
  await act(async () =>
    root.render(
      <TranslationProvider locale={props.locale}>
        <WikiWorkspaceView {...props} />
      </TranslationProvider>,
    ),
  );
}
function selectBody() {
  const body = getByRole(host, "textbox", { name: "Page text" });
  body.focus();
  const range = document.createRange();
  range.selectNodeContents(body);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event("selectionchange"));
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState(null, "", "/editor/wiki/country/example?error=1");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const command = new URL(
      String(input),
      "https://atlas.test",
    ).searchParams.get("command");
    return new Response(
      JSON.stringify(
        command === "search"
          ? { items: [record], total: 1, offset: 0, limit: 30 }
          : command === "folders"
            ? []
            : command === "revisions"
              ? { revisions: [record.revision] }
              : record,
      ),
      { status: 200 },
    );
  });
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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  save.mockReset().mockImplementation(async (form: FormData) => ({
    ok: true,
    page: {
      ...initial,
      id: "wiki-two",
      predecessorId: initial.id,
      summary: form.get("summary"),
      body: form.get("body"),
      bodyDocument: JSON.parse(String(form.get("bodyDocument"))),
      citations: [citation],
      images: JSON.parse(String(form.get("images"))),
      sourceUrls: [],
    },
  }));
  publish.mockReset().mockImplementation(async () => ({
    ok: true,
    page: {
      ...(save.mock.results.at(-1)
        ? (await save.mock.results.at(-1)!.value).page
        : initial),
      id: "wiki-two",
      publishedAt: "2026-01-02T00:00:00Z",
    },
  }));
  props = {
    owner,
    ownerName: "Germany",
    actorId: "author",
    publicHref: "/countries/DE?wiki=1",
    locale: "en",
    draft: initial,
    published: null,
    history: [initial],
    historyPage: 0,
    historyLinks: {},
    query: {},
    embedded: false,
    canEdit: true,
    canPublish: true,
    saveAction: save,
    publishAction: publish,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Wiki workspace", () => {
  it("retains edits across keyboard tabs and the preview toggle, then saves in place and reviews the saved revision", async () => {
    await render();
    await change("Short description", "Updated introduction");
    const tab = getByRole(host, "tab", { name: "Content" });
    await act(async () => {
      fireEvent.keyDown(tab, { key: "ArrowRight" });
    });
    expect(
      getByRole(host, "tab", { name: "Sources & media" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    await click("Hide preview pane");
    await click("Show preview pane");
    await act(async () => {
      fireEvent.click(getByRole(host, "tab", { name: "Content" }));
    });
    expect(
      (
        getByLabelText(host, "Short description", {
          exact: false,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Updated introduction");
    expect(
      localStorage.getItem(`atlas:wiki:author:country:${owner.targetId}`),
    ).toContain("Updated introduction");
    await click("Save draft");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].get("expectedRevisionId")).toBe(initial.id);
    expect(window.location.search).not.toContain("error");
    expect(getByRole(host, "status").textContent).toContain(
      "published page is unchanged",
    );
    await click("Review & publish");
    const dialog = getByRole(host, "dialog", {
      name: "Review before publishing",
    });
    expect(dialog.textContent).toContain("Short description");
    await click("Publish page", dialog);
    expect(publish.mock.calls[0][0].get("revisionId")).toBe("wiki-two");
    expect(
      queryByRole(host, "dialog", { name: "Review before publishing" }),
    ).toBeNull();
    await act(async () =>
      fireEvent.click(getByRole(host, "tab", { name: "History" })),
    );
    expect(
      getByRole(host, "tabpanel", { name: "History" }).textContent,
    ).toContain("Updated introduction");
  });

  it("keeps the receipt and inputs after a failed save and stops publication while unsaved", async () => {
    save.mockResolvedValueOnce({ ok: false, error: "documents" });
    await render();
    await change("Short description", "Retry me");
    await click("Save draft");
    expect(getByRole(host, "alert").textContent).toContain(
      "without creating a duplicate",
    );
    await click("Review & publish");
    expect(
      (
        getByRole(host, "button", {
          name: "Publish page",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await click("Back to editing");
    await click("Save draft");
    expect(save.mock.calls[0][0].get("operationId")).toBe(
      save.mock.calls[1][0].get("operationId"),
    );
    expect(
      (
        getByLabelText(host, "Short description", {
          exact: false,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Retry me");
  });

  it("inserts a pinned citation with a locator, supports undo/redo, edits and removes it, and shares the viewer renderer", async () => {
    await render();
    const body = getByRole(host, "textbox", { name: "Page text" });
    await act(async () => {
      body.focus();
      fireEvent.keyDown(body, { key: "End", ctrlKey: true });
    });
    await click("Bold");
    await click("Cite source");
    const dialog = getByRole(host, "dialog", { name: "Cite a source" });
    await act(async () => dialog.querySelector(".citation-library")!.setAttribute("open", ""));
    await click("Choose existing document", dialog);
    const search = getByRole(dialog, "combobox", { name: "Search documents" });
    await act(async () => { fireEvent.focus(search); fireEvent.change(search, { target: { value: "Archive" } }); });
    await act(async () => fireEvent.keyDown(search, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(search, { key: "Enter" }));
    await act(async () => fireEvent.change(getByLabelText(dialog, "Note for this attachment"), { target: { value: "New source note" } }));
    await click("Attach document", dialog);
    await act(async () => {
      fireEvent.change(getByLabelText(dialog, "Page / passage (optional)"), {
        target: { value: "pp. 12–14" },
      });
    });
    await click("Insert citation", dialog);
    expect(body.querySelector("sup")?.textContent).toBe("[1]");
    expect(body.querySelector("sup")?.getAttribute("aria-label")).toContain(
      "pp. 12–14",
    );
    await click("Undo");
    expect(body.querySelector("sup")).toBeNull();
    await click("Redo");
    expect(body.querySelector("sup")).not.toBeNull();
    await click("Open viewer");
    const viewer = getByRole(host, "dialog", {
      name: "Viewer preview · current draft",
    });
    expect(viewer.querySelector(".wiki-body")?.textContent).toContain(
      "Original text[1]",
    );
    expect(
      within(viewer)
        .getByRole("link", { name: citation.title })
        .getAttribute("href"),
    ).toBe(`/documents/${documentId}?revision=2`);
    await click("Close", viewer);
    await click("Save draft");
    expect(
      JSON.parse(String(save.mock.calls[0][0].get("citations")))[0]
        .citationNote,
    ).toBe("New source note");
    expect(
      JSON.parse(String(save.mock.calls[0][0].get("bodyDocument"))).content[0]
        .content[1].attrs.reference,
    ).toMatchObject({ documentId, revision: 2, locator: "pp. 12–14" });
  });

  it("formats selected text and reverses discrete formatting commands", async () => {
    await render();
    await act(async () => {
      selectBody();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await click("Bold");
    expect(
      getByRole(host, "textbox", { name: "Page text" }).querySelector("strong")
        ?.textContent,
    ).toBe("Original text");
    await click("Undo");
    expect(
      getByRole(host, "textbox", { name: "Page text" }).querySelector("strong"),
    ).toBeNull();
    await click("Redo");
    await click("Save draft");
    expect(String(save.mock.calls[0][0].get("bodyDocument"))).toContain(
      "strong",
    );
  });

  it("applies heading, quote, list and color commands while preserving the selection and history", async () => {
    await render();
    const body = getByRole(host, "textbox", { name: "Page text" });
    await act(async () => {
      selectBody();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await click("Italic");
    await click("Underline");
    expect(body.querySelector("em u, u em")).toBeTruthy();
    await act(async () =>
      fireEvent.change(getByRole(host, "combobox", { name: "Text style" }), {
        target: { value: "heading-3" },
      }),
    );
    expect(body.querySelector("h5")).toBeTruthy();
    await act(async () =>
      fireEvent.change(getByRole(host, "combobox", { name: "Text style" }), {
        target: { value: "paragraph" },
      }),
    );
    await click("Bulleted list");
    expect(body.querySelector("ul li")).toBeTruthy();
    await click("Numbered list");
    expect(body.querySelector("ol li")).toBeTruthy();
    await click("Numbered list");
    expect(body.querySelector("ol")).toBeNull();
    await act(async () =>
      fireEvent.change(getByRole(host, "combobox", { name: "Text style" }), {
        target: { value: "blockquote" },
      }),
    );
    expect(body.querySelector("blockquote")).toBeTruthy();
    await act(async () =>
      fireEvent.change(getByRole(host, "combobox", { name: "Text style" }), {
        target: { value: "paragraph" },
      }),
    );
    expect(body.querySelector("blockquote")).toBeNull();
    await click("Text color");
    await click("Forest green");
    expect(body.querySelector("[style]")?.getAttribute("style")).toContain(
      "53, 90, 71",
    );
    await click("Text color");
    await click("Default ink");
    expect(body.querySelector("[style]")).toBeNull();
    await click("Text color");
    await act(async () =>
      fireEvent.keyDown(getByRole(host, "button", { name: "Forest green" }), {
        key: "Escape",
      }),
    );
    await click("Save draft");
    expect(String(save.mock.calls[0][0].get("bodyDocument"))).toContain(
      "underline",
    );
  });

  it("edits and removes inline citations before permitting the source to detach", async () => {
    const ref = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      documentId,
      revision: 2,
      locator: "p. 1",
    };
    const bodyDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Context" },
            { type: "citation", attrs: { reference: ref } },
          ],
        },
      ],
    };
    await render({ draft: { ...initial, body: "Context", bodyDocument } });
    await act(async () =>
      fireEvent.click(getByRole(host, "tab", { name: "Sources & media" })),
    );
    await click("Detach: Archive report");
    expect(getByRole(host, "alert").textContent).toContain(
      "Remove its inline references",
    );
    await act(async () =>
      fireEvent.click(getByRole(host, "tab", { name: "Content" })),
    );
    const body = getByRole(host, "textbox", { name: "Page text" });
    await act(async () =>
      fireEvent.keyDown(body.querySelector("sup")!, { key: "Enter" }),
    );
    let dialog = getByRole(host, "dialog", { name: "Edit citation" });
    await act(async () =>
      fireEvent.change(getByLabelText(dialog, "Page / passage (optional)"), {
        target: { value: "p. 5" },
      }),
    );
    await click("Update citation", dialog);
    expect(body.querySelector("sup")?.getAttribute("aria-label")).toContain(
      "p. 5",
    );
    await act(async () =>
      fireEvent.keyDown(body.querySelector("sup")!, { key: "Enter" }),
    );
    dialog = getByRole(host, "dialog", { name: "Edit citation" });
    await click("Remove citation", dialog);
    expect(body.querySelector("sup")).toBeNull();
    await act(async () =>
      fireEvent.click(getByRole(host, "tab", { name: "Sources & media" })),
    );
    await click("Detach: Archive report");
    expect(
      queryByRole(host, "link", { name: "Archive report", exact: true }),
    ).toBeNull();
    await click("Save draft");
    expect(JSON.parse(String(save.mock.calls[0][0].get("citations")))).toEqual(
      [],
    );
  });

  it("keeps source pins and image descriptions in separate metadata controls", async () => {
    const image = {
      documentId,
      revision: 2,
      alt: "Map",
      caption: "A map",
      placement: "after_body" as const,
    };
    await render({ draft: { ...initial, images: [image] } });
    await act(async () =>
      fireEvent.click(getByRole(host, "tab", { name: "Sources & media" })),
    );
    await change("Alternative text", "A detailed map");
    const captionDetails = Array.from(host.querySelectorAll("summary")).find(
      (element) => element.textContent === "Caption, credit & placement",
    )!;
    await act(async () => {
      fireEvent.click(captionDetails);
      captionDetails.parentElement!.setAttribute("open", "");
    });
    await change("Credit", "National archive");
    await change("Placement", "before_body");
    await click("Save draft");
    expect(
      JSON.parse(String(save.mock.calls[0][0].get("images"))),
    ).toMatchObject([
      {
        alt: "A detailed map",
        credit: "National archive",
        placement: "before_body",
      },
    ]);
    await click("Remove image: 1");
    expect(queryByRole(host, "button", { name: "Remove image: 1" })).toBeNull();
  });

  it("restores owner-scoped retained text and offers explicit recovery against a newer saved base", async () => {
    localStorage.setItem(
      `atlas:wiki:author:country:${owner.targetId}`,
      JSON.stringify({
        base: "old-base",
        draft: {
          summary: "Recovered context",
          body: "Retained",
          bodyDocument: legacyWikiDocument("Retained"),
          citations: [],
          images: [],
          sourceUrls: "",
        },
      }),
    );
    await render();
    expect(
      (
        getByLabelText(host, "Short description", {
          exact: false,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Original context");
    await click("Recover retained edits");
    expect(
      (
        getByLabelText(host, "Short description", {
          exact: false,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Recovered context");
    expect(getByRole(host, "textbox", { name: "Page text" }).textContent).toBe(
      "Retained",
    );
    await click("Save draft");
    expect(save.mock.calls[0][0].get("expectedRevisionId")).toBe("wiki-one");
  });

  it("renders German review-only controls without permitting edits or publication", async () => {
    await render({
      locale: "de",
      canEdit: false,
      canPublish: false,
      embedded: true,
    });
    expect(
      getByRole(host, "heading", { level: 2, name: "Den Hintergrund prüfen" }),
    ).toBeTruthy();
    expect(
      queryByRole(host, "button", { name: "Entwurf speichern" }),
    ).toBeNull();
    expect(queryByRole(host, "textbox", { name: "Seitentext" })).toBeNull();
    await click("Entwurf prüfen");
    expect(
      getByRole(host, "dialog", { name: "Vor der Veröffentlichung prüfen" })
        .textContent,
    ).toContain("Veröffentlichungsrecht");
    expect(
      queryByRole(host, "button", { name: "Seite veröffentlichen" }),
    ).toBeNull();
  });

  it("validates the description before writing and isolates new owners from a false published status", async () => {
    await render({ draft: null });
    expect(host.querySelector(".status-badge")?.textContent).toBe(
      "Unpublished draft",
    );
    await click("Save draft");
    expect(save).not.toHaveBeenCalled();
    expect(getByRole(host, "alert").textContent).toContain("short description");
  });
});
