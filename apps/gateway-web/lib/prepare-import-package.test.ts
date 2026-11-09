import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationItem, MigrationRun } from "./migration-review";
import { prepareImportPackage } from "./prepare-import-package";
import { needsIntervention } from "./import-review";
const api = vi.hoisted(() => ({
  getMigrationRun: vi.fn(),
  prepareMigrationItem: vi.fn(),
}));
vi.mock("./migration-review", () => api);
function item(
  sourceKey: string,
  dependencies: string[] = [],
  kind = "document",
): MigrationItem {
  return {
    id: sourceKey,
    sourceKey,
    kind,
    state: "staged",
    dependencies,
    result: {},
    attempts: 0,
    error: null,
    sha256: "",
  };
}
let run: MigrationRun;
beforeEach(() => {
  vi.clearAllMocks();
  run = {
    id: "run",
    ownerId: "owner",
    manifest: { runKey: "run", title: "Archive", sources: [] },
    items: [],
    coverage: {},
  };
  api.getMigrationRun.mockImplementation(async () => structuredClone(run));
  api.prepareMigrationItem.mockImplementation(async (_run, id) => {
    const value = run.items.find((candidate) => candidate.id === id)!;
    value.state = "prepared";
    return structuredClone(value);
  });
});
describe("package preparation", () => {
  it("continues dependants after read-back confirms a write whose response was lost", async () => {
    run.items = [item("source"), item("snapshot", ["source"], "snapshot")];
    api.prepareMigrationItem.mockImplementationOnce(async () => {
      run.items[0].state = "prepared";
      throw new Error("response lost");
    });
    await prepareImportPackage("run", "Bearer editor");
    expect(api.prepareMigrationItem.mock.calls.map((call) => call[1])).toEqual([
      "source",
      "snapshot",
    ]);
  });
  it("prepares dependencies before their targets regardless of submission order", async () => {
    run.items = [
      item("snapshot", ["source"], "snapshot"),
      item("source"),
      item("link", ["snapshot"]),
    ];
    await prepareImportPackage("run", "Bearer editor");
    expect(api.prepareMigrationItem.mock.calls.map((call) => call[1])).toEqual([
      "source",
      "snapshot",
      "link",
    ]);
  });
  it("continues independent branches and never blindly replays an uncertain write", async () => {
    run.items = [
      item("source"),
      item("snapshot", ["source"], "snapshot"),
      item("independent"),
    ];
    api.prepareMigrationItem.mockRejectedValueOnce(new Error("response lost"));
    await expect(prepareImportPackage("run", "Bearer editor")).rejects.toThrow(
      "Check the saved package",
    );
    expect(api.prepareMigrationItem.mock.calls.map((call) => call[1])).toEqual([
      "source",
      "independent",
    ]);
  });
  it("waits neutrally for publication and retries failed resources only by explicit preparation", async () => {
    const version = {
      ...item("version", [], "snapshot"),
      state: "prepared",
      result: { status: "approved" },
    };
    run.items = [
      version,
      item("comparison", ["version"], "comparison"),
      { ...item("damaged"), state: "failed" },
    ];
    await prepareImportPackage("run", "Bearer editor");
    expect(api.prepareMigrationItem).not.toHaveBeenCalled();
    version.result.status = "completed";
    await prepareImportPackage("run", "Bearer editor", true);
    expect(api.prepareMigrationItem.mock.calls.map((call) => call[1])).toEqual([
      "comparison",
      "damaged",
    ]);
  });
  it("terminates with unresolved or cyclic dependencies and does not mutate them", async () => {
    run.items = [item("a", ["b"]), item("b", ["a"]), item("c", ["missing"])];
    expect(
      run.items.every((value) => needsIntervention(value, run.items)),
    ).toBe(true);
    await prepareImportPackage("run", "Bearer editor", true);
    expect(api.prepareMigrationItem).not.toHaveBeenCalled();
  });
});
