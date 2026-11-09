import { getMigrationRun, prepareMigrationItem } from "./migration-review";
import { waitsForPublication } from "./import-review";

/** Bounded topological preparation: one attempt per eligible item; independent branches continue. */
export async function prepareImportPackage(
  runId: string,
  authorization: string,
  retryFailed = false,
) {
  const run = await getMigrationRun(runId, authorization);
  if (!run) throw new Error("Import package unavailable");
  const attempted = new Set<string>();
  const uncertain = new Set<string>();
  for (;;) {
    const next = run.items.find(
      (item) =>
        !attempted.has(item.id) &&
        !["prepared", "preparing"].includes(item.state) &&
        (retryFailed || item.state !== "failed") &&
        !waitsForPublication(item, run.items) &&
        item.dependencies.every((key) =>
          run.items.some(
            (dependency) =>
              dependency.sourceKey === key && dependency.state === "prepared",
          ),
        ),
    );
    if (!next) break;
    attempted.add(next.id);
    try {
      const prepared = await prepareMigrationItem(
        runId,
        next.id,
        authorization,
      );
      run.items[run.items.findIndex((item) => item.id === next.id)] = prepared;
    } catch {
      uncertain.add(next.id);
      // A transport failure has an uncertain outcome. Do not replay it in this request.
      // The next read checks the persisted result; other independent items can proceed.
      const observed = await getMigrationRun(runId, authorization).catch(
        () => null,
      );
      if (observed) run.items = observed.items;
    }
  }
  const saved = await getMigrationRun(runId, authorization);
  if (
    !saved ||
    saved.items.some(
      (item) =>
        uncertain.has(item.id) &&
        !["prepared", "preparing", "failed"].includes(item.state),
    )
  )
    throw new Error("Check the saved package before retrying preparation");
  return saved;
}
