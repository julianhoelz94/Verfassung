import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  listDocumentLinks,
  type DocumentLink,
} from "../../../lib/document-api";
import type { PassageProvenance } from "../../../lib/consolidated-comparison";
import { instrument } from "../../../test/reader-fixtures";
import { ComparisonEvidence } from "./ComparisonEvidence";

vi.mock("../../../lib/document-api", () => ({ listDocumentLinks: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const link = (revision = "revision-2", number = 2): DocumentLink =>
  ({
    documentId: "shared-source",
    revisionId: revision,
    document: {
      revision: {
        id: revision,
        revision: number,
        title: "Shared source",
        description: "Recorded commentary",
        sourceUrl: "https://archive.example/source",
        fileName: "source.pdf",
      },
    },
  }) as DocumentLink;

it("deduplicates exact document pins and legacy URLs while retaining every contributing act", async () => {
  const second = {
    ...instrument,
    id: "second",
    title: "Second act",
    publishedRevisionId: "second-r1",
    documents: [
      ...instrument.documents!,
      { url: "javascript:alert(1)", label: "Unsafe source" },
    ],
  };
  const provenance: PassageProvenance[] = [
    { amendment: instrument, change: instrument.changes[0] },
    {
      amendment: second,
      change: { ...instrument.changes[0], id: "second-change" },
    },
  ];
  vi.mocked(listDocumentLinks).mockImplementation(async (type, id) =>
    type === "change_material" && id === "second"
      ? [link("revision-3", 3)]
      : [link()],
  );
  const dom = new DOMParser().parseFromString(
    renderToStaticMarkup(await ComparisonEvidence({ provenance })),
    "text/html",
  );
  expect(dom.querySelectorAll("article")).toHaveLength(2);
  expect(dom.querySelector("article small")?.textContent).toBe(
    "Voting reform · Second act",
  );
  expect(
    dom.querySelectorAll('a[href="https://archive.example/reform"]'),
  ).toHaveLength(1);
  expect(
    dom.querySelector('a[href="/documents/shared-source?revision=2"]'),
  ).not.toBeNull();
  expect(
    dom.querySelector('a[href="/documents/shared-source?revision=3"]'),
  ).not.toBeNull();
  expect(dom.body.textContent).not.toContain("Unsafe source");
  expect(listDocumentLinks).toHaveBeenCalledWith(
    "amendment",
    "instrument",
    "instrument-r1",
  );
  expect(listDocumentLinks).toHaveBeenCalledWith(
    "change_material",
    "second",
    "second-change",
  );
});

it("keeps available evidence visible and reports an unavailable supporting source", async () => {
  vi.mocked(listDocumentLinks).mockImplementation(async (type) => {
    if (type === "amendment_material")
      throw new Error("Document service unavailable");
    return [];
  });
  const html = renderToStaticMarkup(
    await ComparisonEvidence({
      provenance: [
        {
          amendment: {
            ...instrument,
            documents: [{ url: "https://archive.example/unlabelled" }],
          },
          change: instrument.changes[0],
        },
      ],
    }),
  );
  expect(html).toContain('href="https://archive.example/unlabelled"');
  expect(html).toContain("Some supporting materials could not be loaded.");
  expect(html).not.toContain("Commentary &amp; materials");
});
