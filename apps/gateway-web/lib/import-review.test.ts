import { expect, it } from "vitest";
import { selectImportEvidence, sourcesForItem } from "./import-review";
import type { MigrationRun, MigrationItem } from "./migration-review";
const item = (sourceKey: string, kind: string): MigrationItem => ({
  id: sourceKey,
  sourceKey,
  kind,
  sha256: "",
  dependencies: [],
  state: "prepared",
  result: {},
  attempts: 1,
  error: null,
});
it("binds shared captures to their declared targets and does not substitute an unrelated source", () => {
  const run: MigrationRun = {
    id: "run",
    ownerId: "owner",
    coverage: {},
    manifest: {
      runKey: "run",
      title: "Archive",
      sources: [
        {
          sourceKey: "unrelated",
          captureKey: "other",
          targetKeys: ["other-target"],
          url: "https://archive.example/other",
          aliases: [],
          disposition: "included",
        },
        {
          sourceKey: "original",
          captureKey: "capture",
          targetKeys: ["first", "second"],
          url: "https://archive.example/original",
          aliases: [],
          disposition: "included",
        },
      ],
    },
    items: [
      item("other", "document"),
      item("capture", "citation"),
      item("first", "snapshot"),
      item("second", "snapshot"),
      item("no-source", "snapshot"),
    ],
  };
  for (const selected of ["first", "second"]) {
    const evidence = selectImportEvidence(run, { item: selected });
    expect(evidence.source?.sourceKey).toBe("original");
    expect(evidence.capture?.sourceKey).toBe("capture");
  }
  expect(
    selectImportEvidence(run, { item: "no-source" }).source,
  ).toBeUndefined();
  expect(sourcesForItem(run, run.items[4])).toEqual([]);
});
