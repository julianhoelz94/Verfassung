import type {
  MigrationItem,
  MigrationRun,
  MigrationSource,
} from "./migration-review";

export type ImportReviewQuery = {
  state?: string;
  item?: string;
  source?: string;
  sourceOffset?: string;
  attemptOffset?: string;
  error?: string;
  view?: string;
  display?: string;
};
export const packageReviewHref = (
  run: string,
  item?: string,
  query?: Record<string, string>,
) => {
  const params = new URLSearchParams(query);
  if (item) params.set("item", item);
  return `/admin/import/packages/${encodeURIComponent(run)}${params.size ? `?${params}` : ""}`;
};
export function sourcesForItem(
  run: MigrationRun,
  item?: MigrationItem,
): MigrationSource[] {
  if (!item) return run.manifest.sources;
  return run.manifest.sources.filter(
    (source) =>
      source.sourceKey === item.sourceKey ||
      source.captureKey === item.sourceKey ||
      source.targetKeys?.includes(item.sourceKey),
  );
}
export function selectImportEvidence(
  run: MigrationRun,
  query: ImportReviewQuery,
) {
  const requested = run.manifest.sources.find(
    (source) => source.sourceKey === query.source,
  );
  const candidates = requested
    ? run.items.filter((item) => sourcesForItem(run, item).includes(requested))
    : run.items;
  const selected =
    candidates.find((item) => item.id === query.item) ??
    candidates.find((item) => item.kind === "snapshot") ??
    candidates[0];
  const source = requested ?? sourcesForItem(run, selected)[0];
  const capture = source
    ? run.items.find(
        (item) =>
          item.sourceKey === (source.captureKey ?? source.sourceKey) &&
          ["document", "citation"].includes(item.kind),
      )
    : selected && ["document", "citation"].includes(selected.kind)
      ? selected
      : undefined;
  return { selected, source, capture };
}
export function waitsForPublication(
  item: MigrationItem,
  items: MigrationItem[],
) {
  return (
    item.kind === "comparison" &&
    item.dependencies.some((key) => {
      const dependency = items.find((candidate) => candidate.sourceKey === key);
      return (
        dependency?.kind === "snapshot" &&
        dependency.result.status !== "completed"
      );
    })
  );
}
export function needsIntervention(item: MigrationItem, items: MigrationItem[]) {
  const active = new Set<string>(),
    resolved = new Set<string>();
  function unresolved(candidate: MigrationItem): boolean {
    if (active.has(candidate.sourceKey)) return true;
    if (resolved.has(candidate.sourceKey)) return false;
    active.add(candidate.sourceKey);
    for (const key of candidate.dependencies) {
      const dependency = items.find((value) => value.sourceKey === key);
      if (!dependency || unresolved(dependency)) return true;
    }
    active.delete(candidate.sourceKey);
    resolved.add(candidate.sourceKey);
    return false;
  }
  return item.state === "failed" || unresolved(item);
}
