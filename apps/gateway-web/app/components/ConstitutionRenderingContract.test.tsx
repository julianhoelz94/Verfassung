import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ContentOutline, OrderedEntry } from "../../lib/api";
import { ConstitutionText, OrderedContentTree } from "./ConstitutionText";
import { DiffConstitutionText } from "./DiffConstitutionText";

vi.mock("./NodeTitleForm", () => ({ NodeTitleForm: () => null }));

const outline: ContentOutline = {
  kinds: [
    {
      kindCode: "article",
      displayLabel: "Article",
      sortOrder: 0,
      mayHoldText: true,
      mayHoldChildren: true,
      allowedChildKinds: ["sentence"],
      showLabel: false,
      showTitle: false,
      showKind: false,
    },
    {
      kindCode: "sentence",
      displayLabel: "Sentence",
      sortOrder: 1,
      mayHoldText: true,
      mayHoldChildren: false,
      allowedChildKinds: [],
      presentation: "concatenated",
      showLabel: false,
      showTitle: false,
      showKind: false,
    },
  ],
};

function text(
  id: string,
  value: string,
  extra: Partial<OrderedEntry> = {},
): OrderedEntry {
  return {
    type: "text",
    logicalId: id,
    occurrenceId: `${id}-occ`,
    text: value,
    ...extra,
  };
}

function child(
  id: string,
  value: string,
  label = "(1)",
  content?: OrderedEntry[],
): OrderedEntry {
  return {
    type: "child",
    node: {
      logicalId: id,
      occurrenceId: `${id}-occ`,
      revisionId: `${id}-rev`,
      kind: "sentence",
      label,
      title: null,
      content: content ?? [text(`${id}-text`, value)],
    },
  };
}

function render(props: ComponentProps<typeof OrderedContentTree>): string {
  return renderToStaticMarkup(createElement(OrderedContentTree, props));
}

function compare(
  left: OrderedEntry[],
  right: OrderedEntry[],
  side: "from" | "to",
  legacyIdentity = true,
): string {
  return renderToStaticMarkup(
    <DiffConstitutionText
      left={{ articleNumber: "1", title: "", content: left, legacyIdentity }}
      right={{ articleNumber: "1", title: "", content: right, legacyIdentity }}
      side={side}
      outline={outline}
    />,
  );
}

describe("constitution rendering contracts", () => {
  it("lets explicit empty ordered entries override legacy projections", () => {
    const html = renderToStaticMarkup(
      <ConstitutionText
        article={{
          articleNumber: "1",
          title: "",
          body: "legacy",
          children: [],
          content: [text("stored", "stored")],
        }}
        entries={[]}
        outline={outline}
      />,
    );
    expect(html).not.toContain("legacy");
    expect(html).not.toContain("stored");
    expect(html).toContain('<div class="node-tree"></div>');
  });

  it("uses explicit null body before the article projection when no ordered content exists", () => {
    const html = renderToStaticMarkup(
      <ConstitutionText
        article={{ articleNumber: "1", title: "", body: "legacy" }}
        body={null}
        outline={outline}
      />,
    );
    expect(html).not.toContain("legacy");
  });

  it("orders references by UTF-16 ranges and calls slice rendering for gaps only", () => {
    const calls: string[] = [];
    const entry = text("t", "A😀B CD", {
      references: [
        {
          logicalId: "second",
          start: 5,
          end: 7,
          target: { type: "external", url: "https://second.example" },
        },
        {
          logicalId: "first",
          start: 1,
          end: 3,
          target: { type: "external", url: "https://first.example" },
        },
      ],
    });
    const html = render({
      entries: [entry],
      renderTextSlice: (_, start, end) => {
        calls.push(`slice:${start}:${end}`);
        return <i>{entry.text!.slice(start, end)}</i>;
      },
      renderReference: (ref, label, href) => {
        calls.push(`${ref.logicalId}:${label}:${href}`);
        return <b>{label}</b>;
      },
    });
    expect(calls).toEqual([
      "slice:0:1",
      "first:😀:https://first.example",
      "slice:3:5",
      "second:CD:https://second.example",
    ]);
    expect(html).toContain('id="ref-first"><b>😀</b>');
    expect(html).not.toContain("xref");
  });

  it("prefers the selected snapshot unit index and country route over local targets", () => {
    const entry = text("t", "link", {
      references: [
        {
          logicalId: "r",
          start: 0,
          end: 4,
          target: { type: "unit", logicalId: "target" },
        },
      ],
    });
    const html = render({
      entries: [entry, child("target", "Target")],
      idPrefix: "local-",
      crossRefs: {
        code: "DE",
        versionId: "version",
        articlesByNumber: {},
        unitsByLogicalId: {
          target: { rootId: "snapshot-root", occurrenceId: "snapshot-occ" },
        },
      },
    });
    expect(html).toContain(
      'href="/countries/DE/versions/version#snapshot-occ"',
    );
    expect(html).not.toContain('href="#local-target-occ"');
  });

  it.each([
    { owner: { jurisdictionId: "region" }, expected: 'href="/jurisdictions/region/versions/version#occ"' },
    { owner: {}, expected: 'class="xref-unavailable"' },
  ])("uses the owning reader or marks ownerless targets unavailable: $expected", ({ owner, expected }) => {
    const entry = text("t", "link", {
      references: [
        {
          logicalId: "r",
          start: 0,
          end: 4,
          target: { type: "unit", logicalId: "target" },
        },
      ],
    });
    const html = render({
      entries: [entry],
      crossRefs: {
        ...owner,
        versionId: "version",
        articlesByNumber: {},
        unitsByLogicalId: { target: { rootId: "root", occurrenceId: "occ" } },
      },
    });
    expect(html).toContain(expected);
    expect(html).not.toContain('/versions/version/units/');
  });

  it("uses local occurrence anchors and retains unavailable formatted references", () => {
    const entry = text("t", "AB", {
      marks: [{ type: "bold", start: 0, end: 2 }],
      references: [
        {
          logicalId: "known",
          start: 0,
          end: 1,
          target: { type: "unit", logicalId: "target" },
        },
        {
          logicalId: "unknown",
          start: 1,
          end: 2,
          target: { type: "unit", logicalId: "missing" },
        },
      ],
    });
    const html = render({
      entries: [entry, child("target", "Target")],
      idPrefix: "p-",
    });
    expect(html).toContain('href="#p-target-occ"><strong>A</strong>');
    expect(html).toContain('class="xref-unavailable"');
    expect(html).toContain("<strong>B</strong>");
  });

  it("retains table caption and row-major callback order and exact header links", () => {
    const calls: string[] = [];
    const entry = text("table", "projection", {
      format: "table",
      table: {
        caption: "Caption",
        rows: [
          {
            logicalId: "row",
            cells: [
              { logicalId: "heading", header: true, text: "Heading" },
              {
                logicalId: "value",
                header: false,
                text: "Value",
                headers: ["heading"],
                rowSpan: 2,
                colSpan: 3,
              },
            ],
          },
        ],
      },
    });
    const html = render({
      entries: [entry],
      idPrefix: "p-",
      renderTableCaption: () => {
        calls.push("caption");
        return "Custom caption";
      },
      renderTableCell: (cell) => {
        calls.push(cell.logicalId);
        return cell.text;
      },
    });
    expect(calls).toEqual(["caption", "heading", "value"]);
    expect(html).toContain("<caption>Custom caption</caption>");
    expect(html).toContain(
      'id="p-cell-value" headers="p-cell-heading" rowSpan="2" colSpan="3"',
    );
  });

  it("renders note text through the full-text override even when references exist", () => {
    const calls: string[] = [];
    const note = text("note", "Source", {
      format: "footnote",
      footnoteLabel: "4",
      annotation: {
        kind: "editorial",
        attribution: "Archive",
        sourceUrl: "http://unlinked.example",
      },
      references: [
        {
          logicalId: "r",
          start: 0,
          end: 6,
          target: { type: "external", url: "https://example.org" },
        },
      ],
    });
    const html = render({
      entries: [note],
      renderText: (entry) => {
        calls.push(entry.logicalId!);
        return <em>{entry.text}</em>;
      },
      renderReference: () => {
        calls.push("reference");
        return "wrong";
      },
    });
    expect(calls).toEqual(["note"]);
    expect(html).toContain("<em>Source</em>");
    expect(html).toContain("Archive");
    expect(html).not.toContain("http://unlinked.example");
  });

  it("keeps reference dispatch for ordinary text when a full-text override is supplied", () => {
    const entry = text("t", "link", {
      references: [
        {
          logicalId: "r",
          start: 0,
          end: 4,
          target: { type: "external", url: "https://example.org" },
        },
      ],
    });
    const renderText = vi.fn(() => "wrong");
    const html = render({ entries: [entry], renderText });
    expect(renderText).not.toHaveBeenCalled();
    expect(html).toContain('class="xref" href="https://example.org">link</a>');
  });

  it("reserves stable sibling identity before legacy label matching", () => {
    const left = [
      child("stable", "Stable old"),
      child("old-legacy", "Legacy old"),
    ];
    const right = [
      child("new-legacy", "Legacy new"),
      child("stable", "Stable new"),
    ];
    const html = compare(left, right, "to");
    expect(html).toContain("<span>Legacy </span>");
    expect(html).toContain("<span>Stable </span>");
    expect(html).not.toContain('<ins class="diff-add">Legacy new</ins>');
  });

  it("pairs globally moved stable descendants even outside their old sibling group", () => {
    const left = [
      child("first", "", "(1)", [child("moved", "Shared old")]),
      child("second", "", "(2)", []),
    ];
    const right = [
      child("first", "", "(1)", []),
      child("second", "", "(2)", [child("moved", "Shared new")]),
    ];
    const html = compare(left, right, "to", false);
    expect(html).toContain("<span>Shared </span>");
    expect(html).toContain('<ins class="diff-add">new</ins>');
    expect(html).not.toContain('<ins class="diff-add">Shared new</ins>');
  });
});
