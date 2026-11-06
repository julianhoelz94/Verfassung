import { beforeEach, expect, it, vi } from "vitest";
import type { Amendment } from "../../../lib/api";
import { resolveUnit } from "../../../lib/api";
import { expandHistoryPassageScope } from "./history-page-state";
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
