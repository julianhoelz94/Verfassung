import type {
  Amendment,
  AmendmentChange,
  ConstitutionLifecycleEvent,
  VersionSummary,
} from "./api";
import { snapshotVersionId } from "./reading";
import type { ViewerLocation } from "./constitution-viewer";

export type ConstitutionHistoryItem = {
  id: string;
  kind: "version" | "amendment" | "event";
  date: string;
  title: string;
  summary?: string | null;
  href: string;
  amendment?: Amendment;
  version?: VersionSummary;
};
export function passageMatches(
  change: AmendmentChange,
  scope: ReadonlySet<string>,
) {
  return (
    !scope.size ||
    [change.beforeRef?.logicalId, change.afterRef?.logicalId].some(
      (id) => id && scope.has(id),
    )
  );
}
export function constitutionHistory(
  owner: string,
  constitutionId: string,
  versions: VersionSummary[],
  amendments: Amendment[],
  events: ConstitutionLifecycleEvent[],
  scope: ReadonlySet<string>,
): ConstitutionHistoryItem[] {
  const base = `${owner}/constitutions/${constitutionId}`;
  return [
    ...(!scope.size
      ? versions.map((v) => ({
          id: snapshotVersionId(v),
          kind: "version" as const,
          date: v.effectiveDate ?? "",
          title: v.versionLabel,
          summary: v.publicationComment,
          href: `${owner}/versions/${snapshotVersionId(v)}`,
          version: v,
        }))
      : []),
    ...amendments
      .filter((a) => a.changes.some((c) => passageMatches(c, scope)))
      .map((a) => ({
        id: a.id,
        kind: "amendment" as const,
        date: a.effectiveOn ?? a.enactedOn ?? "",
        title: a.title,
        summary: a.comment ?? a.summary,
        href: `${base}/amendments/${a.id}`,
        amendment: a,
      })),
    ...(!scope.size
      ? events.map((e) => ({
          id: e.id,
          kind: "event" as const,
          date: e.eventDate,
          title: e.eventType,
          summary: e.note,
          href: `${base}/events/${e.id}`,
        }))
      : []),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (a.kind === "version"
        ? -1
        : b.kind === "version"
          ? 1
          : a.id.localeCompare(b.id)),
  );
}
export function viewedHistoryItem(
  viewed: ViewerLocation | null,
  item: ConstitutionHistoryItem,
) {
  return viewed?.kind === item.kind && viewed.id === item.id;
}
