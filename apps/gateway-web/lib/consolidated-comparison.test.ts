import { describe, expect, it } from "vitest";
import type { Amendment, ArticleSummary, OrderedEntry } from "./api";
import { consolidatePassages, indexPassages } from "./consolidated-comparison";
const text = (id: string, value: string, revision = "a"): OrderedEntry => ({
  type: "text",
  logicalId: id,
  revisionId: revision,
  occurrenceId: revision + id,
  text: value,
});
const article = (entries: OrderedEntry[]): ArticleSummary => ({
  id: "root",
  logicalId: "article-8",
  versionId: "snapshot",
  articleNumber: "8",
  title: "Assembly",
  body: "",
  sortOrder: 0,
  content: entries,
});
const act = (
  id: string,
  passage: string,
  before: string,
  after: string,
): Amendment => ({
  id,
  title: id,
  summary: "",
  enactedOn: null,
  sourceReference: null,
  changes: [
    {
      id: id + "-change",
      articleId: null,
      articleNumber: "8",
      changeType: "modified",
      note: "Note for " + id,
      beforeRef: { logicalId: passage, text: before },
      afterRef: { logicalId: passage, text: after },
    },
  ],
});

describe("consolidated legal comparison", () => {
  it("keeps nested passage breadcrumbs ordered without repeating ancestors", () => {
    const nested: OrderedEntry = {
      type: "child",
      node: {
        logicalId: "paragraph",
        revisionId: "paragraph-revision",
        occurrenceId: "paragraph-occurrence",
        title: null,
        kind: "paragraph",
        label: "1",
        content: [
          {
            type: "child",
            node: {
              logicalId: "sentence",
              revisionId: "sentence-revision",
              occurrenceId: "sentence-occurrence",
              title: null,
              kind: "sentence",
              label: "2",
              content: [text("words", "Before")],
            },
          },
        ],
      },
    };
    expect(indexPassages([article([nested])]).get("words")?.label).toBe(
      "8 · Assembly › paragraph 1 › sentence 2",
    );
  });
  it("shows a passage once using endpoint wording and retains both contributing acts", () => {
    const rows = consolidatePassages(
      [article([text("assembly", "Citizens may assemble.")])],
      [article([text("assembly", "Everyone may assemble.")])],
      [
        act(
          "first",
          "assembly",
          "Citizens may assemble.",
          "Residents may assemble.",
        ),
        act(
          "second",
          "assembly",
          "Residents may assemble.",
          "Everyone may assemble.",
        ),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].before?.text).toBe("Citizens may assemble.");
    expect(rows[0].after?.text).toBe("Everyone may assemble.");
    expect(rows[0].provenance.map((p) => p.amendment.id)).toEqual([
      "first",
      "second",
    ]);
  });
  it("finds changes without amendment attribution and ignores storage revision churn", () => {
    const rows = consolidatePassages(
      [article([text("same", "Same", "old"), text("changed", "Before")])],
      [article([text("same", "Same", "new"), text("changed", "After")])],
      [],
    );
    expect(rows.map((r) => r.id)).toEqual(["changed"]);
    expect(rows[0].provenance).toEqual([]);
  });
  it("keeps reverted wording and temporary provisions separate from net changes", () => {
    const rows = consolidatePassages(
      [article([text("assembly", "Original")])],
      [article([text("assembly", "Original", "new")])],
      [
        act("first", "assembly", "Original", "Temporary"),
        act("second", "assembly", "Temporary", "Original"),
        act("create", "office", "", "Office exists"),
        act("close", "office", "Office exists", ""),
      ],
    );
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ["assembly", "reversed"],
      ["office", "reversed"],
    ]);
    expect(rows.every((r) => r.provenance.length === 2)).toBe(true);
  });
  it("uses the recorded comparison scope and avoids duplicate child results", () => {
    const parent = act("first", "article-8", "Before", "After");
    const rows = consolidatePassages(
      [article([text("assembly", "Before")])],
      [article([text("assembly", "After")])],
      [parent, act("second", "assembly", "Before", "After")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("article-8");
    expect(rows[0].provenance).toHaveLength(2);
  });
  it("detects reordered entries as one structural change", () => {
    const before = article([text("one", "First"), text("two", "Second")]),
      after = article([text("two", "Second"), text("one", "First")]);
    const rows = consolidatePassages([before], [after], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("article-8");
    expect(rows[0].kind).toBe("changed");
  });
  it("retains reordered articles but does not report insertion as moves of unchanged neighbors", () => {
    const first = article([text("one", "First")]);
    const second = {
      ...article([text("two", "Second")]),
      logicalId: "article-9",
      articleNumber: "9",
    };
    const inserted = {
      ...article([text("three", "New")]),
      logicalId: "article-10",
      articleNumber: "10",
    };
    const moved = consolidatePassages([first, second], [second, first], []);
    expect(moved.map((row) => [row.id, row.kind, row.orderChanged])).toEqual([
      ["article-9", "changed", true],
      ["article-8", "changed", true],
    ]);
    expect(
      consolidatePassages([first, second], [first, inserted, second], []).map(
        (row) => row.id,
      ),
    ).toEqual(["article-10"]);
  });
  it("preserves formatting-only changes", () => {
    const before = text("assembly", "Same words"),
      after = {
        ...text("assembly", "Same words"),
        marks: [{ type: "bold" as const, start: 0, end: 4 }],
      };
    expect(
      consolidatePassages([article([before])], [article([after])], [])[0].kind,
    ).toBe("changed");
  });
});
