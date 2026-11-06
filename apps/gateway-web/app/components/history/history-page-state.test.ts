import { beforeEach, expect, it, vi } from "vitest";
import type { Amendment } from "../../../lib/api";
import { getVersion, listAllUnits, resolveUnit } from "../../../lib/api";
import {
  article,
  countryFixture,
  nextLaw,
  original,
} from "../../../test/reader-fixtures";
import type { ViewerModel } from "./load-viewer";
import {
  expandHistoryPassageScope,
  historySnapshotAliases,
  historyPassageScope,
  historyItemMarker,
  matchesHistoryFilters,
} from "./history-page-state";
vi.mock("../../../lib/api", () => ({
  resolveUnit: vi.fn(),
  getVersion: vi.fn(),
  listAllUnits: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
const amendment = (ids: string[]): Amendment => ({
  id: "law",
  title: "Law",
  summary: "",
  enactedOn: null,
  sourceReference: null,
  changes: ids.map((id) => ({
    id,
    articleId: null,
    articleNumber: "8",
    changeType: "added",
    note: null,
    afterRef: { versionId: "later-snapshot", logicalId: id },
  })),
});
it("includes newly added descendants and renumbered passages without matching a reused article label", async () => {
  const scope = new Set(["assembly"]);
  vi.mocked(resolveUnit).mockImplementation(async (_version, id) => ({
    logicalId: id,
    pathLabels: ["Article 8"],
    deepLink: "/text",
    breadcrumbs: id === "unrelated" ? ["another-article"] : ["assembly"],
  }));
  expect(
    await expandHistoryPassageScope(
      [amendment(["new-paragraph", "renumbered-child", "unrelated"])],
      scope,
    ),
  ).toBe(false);
  expect([...scope]).toEqual(["assembly", "new-paragraph", "renumbered-child"]);
});
it("stops an unavailable ancestry source after a bounded batch and reports incomplete filtering", async () => {
  vi.mocked(resolveUnit).mockRejectedValue(new Error("Content unavailable"));
  const scope = new Set(["assembly"]);
  expect(
    await expandHistoryPassageScope(
      [amendment(Array.from({ length: 20 }, (_, i) => "child-" + i))],
      scope,
    ),
  ).toBe(true);
  expect(resolveUnit).toHaveBeenCalledTimes(6);
  expect([...scope]).toEqual(["assembly"]);
});

const model = {
  owner: "/countries/XA",
  constitution: countryFixture().constitutions[0],
  versions: [original, nextLaw],
} as ViewerModel;
it("recognizes old published pins while refusing draft and foreign-constitution aliases", async () => {
  vi.mocked(getVersion).mockImplementation(async (id) => ({
    ...original,
    id,
    constitutionId: id === "foreign" ? "other-charter" : "charter",
    publicationStatus: id === "draft" ? "draft" : "published",
  }));
  const aliases = await historySnapshotAliases(model, {
    sourceVersion: "draft",
    viewed: JSON.stringify({
      kind: "comparison",
      href: "/countries/XA/compare?from=old-public&to=foreign",
    }),
  });
  expect(aliases).toEqual({ "old-public": "law-1949" });
  expect(
    await historySnapshotAliases(model, {
      viewed: JSON.stringify({
        kind: "version",
        href: "/countries/XA/versions/old-public",
      }),
    }),
  ).toEqual({ "old-public": "law-1949" });
});

it("does not resolve external or malformed bookmarks and already-known snapshot tips", async () => {
  for (const viewed of [
    "invalid-json",
    JSON.stringify({
      kind: "comparison",
      href: "https://elsewhere.example/countries/XA/compare?from=private",
    }),
  ]) {
    expect(
      await historySnapshotAliases(model, {
        viewed,
        sourceVersion: "correction-1949",
      }),
    ).toEqual({});
  }
  expect(getVersion).not.toHaveBeenCalled();
});

it("includes the pinned root's logical descendants without borrowing another passage's identity", async () => {
  vi.mocked(listAllUnits).mockResolvedValue([
    {
      ...article("root", "1", "Text"),
      title: "Assembly",
      logicalId: "assembly",
      content: [
        {
          type: "text",
          logicalId: "leaf",
          revisionId: "leaf-revision",
          occurrenceId: "leaf-occurrence",
          text: "Text",
        },
      ],
    },
  ]);
  const result = await historyPassageScope(
    { passage: "assembly", sourceVersion: "pinned" },
    () => true,
  );
  expect([...result.scope]).toEqual(["assembly", "leaf"]);
  expect(result.scopeLabel).toBe("1 · Assembly");
  expect(result.scopeUnavailable).toBe(false);
  expect(resolveUnit).not.toHaveBeenCalled();
});

it("resolves a nested label and reports unavailable content while retaining the requested scope", async () => {
  vi.mocked(listAllUnits).mockResolvedValue([]);
  vi.mocked(resolveUnit).mockResolvedValue({
    logicalId: "leaf",
    pathLabels: ["Article 1", "Sentence 2"],
    deepLink: "/text",
  });
  const query = { passage: "leaf", sourceVersion: "pinned" };
  expect((await historyPassageScope(query, () => true)).scopeLabel).toBe(
    "Article 1 › Sentence 2",
  );
  vi.mocked(resolveUnit).mockRejectedValue(new Error("Unavailable"));
  const unresolved = await historyPassageScope(query, () => true);
  expect(unresolved.scopeUnavailable).toBe(true);
  expect([...unresolved.scope]).toEqual(["leaf"]);
  vi.mocked(listAllUnits).mockRejectedValue(new Error("Unavailable"));
  expect((await historyPassageScope(query, () => true)).scopeUnavailable).toBe(
    true,
  );
});

it("does not query an unvalidated source snapshot", async () => {
  expect([
    ...(
      await historyPassageScope(
        { passage: "leaf", sourceVersion: "private" },
        () => false,
      )
    ).scope,
  ]).toEqual(["leaf"]);
  expect(listAllUnits).not.toHaveBeenCalled();
});

it("marks comparison endpoints through their legal aliases without marking either as the current reader", () => {
  const viewed = {
    kind: "comparison" as const,
    href: "/compare",
    label: "Range",
    from: "old-pin",
    to: "law-1956",
  };
  const item = {
    kind: "version" as const,
    id: "correction-1949",
    version: original,
    date: "1949-05-23",
    title: "1949",
    href: "/text",
  };
  expect(historyItemMarker(viewed, item, { "old-pin": original.id })).toEqual({
    isCurrent: false,
    endpoint: "start",
  });
  expect(
    historyItemMarker(
      viewed,
      { ...item, id: nextLaw.id, version: nextLaw },
      {},
    ),
  ).toEqual({ isCurrent: false, endpoint: "end" });
  expect(
    historyItemMarker(
      { kind: "version", href: "/text", label: "1949", id: "old-pin" },
      item,
      { "old-pin": original.id },
    ).isCurrent,
  ).toBe(true);
  expect(historyItemMarker(null, item, {}).isCurrent).toBe(false);
});

it("filters by record kind, recorded year and passage-note content", () => {
  const item = {
    id: "law",
    kind: "amendment" as const,
    date: "2024-01-01",
    title: "Act",
    summary: "",
    href: "/act",
    amendment: {
      ...amendment(["leaf"]),
      changes: [
        {
          ...amendment(["leaf"]).changes[0],
          note: "Assembly guarantee",
          articleNumber: "8",
        },
      ],
    },
  };
  expect(matchesHistoryFilters(item, { kind: "event" })).toBe(false);
  expect(matchesHistoryFilters(item, { year: "2020" })).toBe(false);
  expect(
    matchesHistoryFilters(item, {
      kind: "amendment",
      year: "2024",
      q: "ASSEMBLY",
    }),
  ).toBe(true);
  expect(matchesHistoryFilters(item, { q: "unrelated" })).toBe(false);
  expect(matchesHistoryFilters(item, {})).toBe(true);
});
