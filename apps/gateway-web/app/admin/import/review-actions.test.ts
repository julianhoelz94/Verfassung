import { beforeEach, expect, it, vi } from "vitest";
import { transitionImportAction, prepareImportPackageAction } from "./actions";
import { ImportTransitionError } from "../../../lib/ingestion-api";
const api = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requireSessionBearer: vi.fn(),
  getMigrationRun: vi.fn(),
  transitionImportJob: vi.fn(),
  prepareImportPackage: vi.fn(),
}));
vi.mock("../../../lib/session", () => ({
  currentUser: api.currentUser,
  requireSessionBearer: api.requireSessionBearer,
}));
vi.mock("../../../lib/migration-review", () => ({
  getMigrationRun: api.getMigrationRun,
}));
vi.mock("../../../lib/prepare-import-package", () => ({
  prepareImportPackage: api.prepareImportPackage,
}));
vi.mock("../../../lib/ingestion-api", async (original) => ({
  ...(await original<typeof import("../../../lib/ingestion-api")>()),
  transitionImportJob: api.transitionImportJob,
}));
beforeEach(() => {
  vi.clearAllMocks();
  api.currentUser.mockResolvedValue({ roles: ["admin"], stepUpFresh: true });
  api.requireSessionBearer.mockResolvedValue("Bearer staff");
  api.getMigrationRun.mockResolvedValue({
    items: [{ id: "item", result: { jobId: "job" } }],
  });
  api.transitionImportJob.mockResolvedValue({ status: "completed" });
  api.prepareImportPackage.mockResolvedValue(null);
});
const form = (action = "publish") => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    action,
    runId: "run",
    itemId: "item",
    jobId: "job",
    reason: "Compared the complete wording with its archived source.",
  }))
    data.set(key, value);
  return data;
};
it("verifies the package/job association before issuing any mutation", async () => {
  const data = form();
  data.set("jobId", "other-job");
  expect(await transitionImportAction(data)).toContain("error=forbidden");
  expect(api.transitionImportJob).not.toHaveBeenCalled();
});
it("retains the package and selected item through fresh-authentication handoff", async () => {
  api.currentUser.mockResolvedValue({
    roles: ["publisher"],
    stepUpFresh: false,
  });
  const destination = await transitionImportAction(form());
  expect(destination).toContain("/account/step-up?returnTo=");
  expect(decodeURIComponent(destination)).toContain(
    "/admin/import/packages/run?view=review&item=item",
  );
  expect(api.transitionImportJob).not.toHaveBeenCalled();
});
it("resumes eligible package dependencies after publication by an editor/admin", async () => {
  expect(await transitionImportAction(form())).toBe(
    "/admin/import/packages/run?view=review&item=item",
  );
  expect(api.prepareImportPackage).toHaveBeenCalledWith("run", "Bearer staff");
});
it("returns to the selected package review after an expired-session sign-in", async () => {
  api.transitionImportJob.mockRejectedValueOnce(new ImportTransitionError("session_expired"));
  expect(await transitionImportAction(form())).toBe(
    `/login?next=${encodeURIComponent("/admin/import/packages/run?view=review&item=item")}`,
  );
  expect(api.prepareImportPackage).not.toHaveBeenCalled();
});
it("does not silently grant preparation rights to a publisher-only account", async () => {
  api.currentUser.mockResolvedValue({
    roles: ["publisher"],
    stepUpFresh: true,
  });
  await transitionImportAction(form());
  expect(api.transitionImportJob).toHaveBeenCalledOnce();
  expect(api.prepareImportPackage).not.toHaveBeenCalled();
  expect(await prepareImportPackageAction(form())).toContain("error=forbidden");
});
it("retains the minimum reason requirement and a separate reviewer permission", async () => {
  const data = form("approve");
  data.set("reason", "short");
  expect(await transitionImportAction(data)).toContain("error=reason");
  api.currentUser.mockResolvedValue({ roles: ["editor"] });
  expect(await transitionImportAction(form("approve"))).toContain(
    "error=forbidden",
  );
  expect(api.transitionImportJob).not.toHaveBeenCalled();
});
