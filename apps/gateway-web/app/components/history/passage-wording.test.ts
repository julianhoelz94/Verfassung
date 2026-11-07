import { beforeEach, expect, it, vi } from "vitest";
import {
  resolveUnit,
  type AmendmentChange,
  type ResolvedUnit,
} from "../../../lib/api";
import { loadPassageWording } from "./passage-wording";

vi.mock("../../../lib/api", () => ({ resolveUnit: vi.fn() }));
const ref = {
  versionId: "published-pin",
  logicalId: "logical",
  occurrenceId: "occurrence",
  revisionId: "revision",
};
const change: AmendmentChange = {
  id: "change",
  articleId: null,
  articleNumber: "1",
  changeType: "removed",
  note: "Original note",
  beforeRef: ref,
};
const unit: ResolvedUnit = {
  ...ref,
  constitutionId: "constitution",
  pathLabels: ["Article 1", "Paragraph 1"],
  text: "Exact  historical wording.",
  deepLink: "/countries/XA/versions/published-pin#occurrence",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveUnit).mockResolvedValue(unit);
});

it("deduplicates exact pins and preserves authored wording and record identity", async () => {
  const loaded = await loadPassageWording(
    [change, { ...change, id: "another" }],
    "constitution",
  );
  expect(resolveUnit).toHaveBeenCalledTimes(1);
  expect(loaded[0]).toMatchObject({
    ...change,
    beforeRef: {
      ...ref,
      text: unit.text,
      label: "Paragraph 1",
      breadcrumbs: ["Article 1"],
      deepLink: unit.deepLink,
    },
  });
  expect(change.beforeRef).not.toHaveProperty("text");
  expect(loaded[1].id).toBe("another");
});

it.each([
  "versionId",
  "logicalId",
  "constitutionId",
  "occurrenceId",
  "revisionId",
] as const)("rejects a resolved passage with a different %s", async (key) => {
  vi.mocked(resolveUnit).mockResolvedValue({ ...unit, [key]: "other" });
  expect(await loadPassageWording([change], "constitution")).toEqual([change]);
});

it("retains unavailable and unmapped records and explicit empty wording", async () => {
  vi.mocked(resolveUnit).mockRejectedValue(new Error("Unavailable"));
  const unmapped = { ...change, id: "unmapped", beforeRef: null };
  const empty = { ...change, id: "empty", beforeRef: { ...ref, text: "" } };
  expect(
    await loadPassageWording([change, unmapped, empty], "constitution"),
  ).toEqual([change, unmapped, empty]);
  expect(resolveUnit).toHaveBeenCalledTimes(1);
});

it("bounds concurrent snapshot resolution across a long amendment", async () => {
  let active = 0,
    peak = 0;
  vi.mocked(resolveUnit).mockImplementation(async (versionId, logicalId) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { ...unit, versionId, logicalId };
  });
  const changes = Array.from({ length: 19 }, (_, id) => ({
    ...change,
    id: String(id),
    beforeRef: { ...ref, logicalId: String(id) },
  }));
  expect(await loadPassageWording(changes, "constitution")).toHaveLength(19);
  expect(peak).toBe(6);
});
