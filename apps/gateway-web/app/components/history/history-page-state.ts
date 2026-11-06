import {
  getVersion,
  listAllUnits,
  resolveUnit,
  type Amendment,
  type AmendmentUnitRef,
} from "../../../lib/api";
import { snapshotVersionId } from "../../../lib/reading";
import { orderedTargets } from "../../../lib/ordered-content";
import type { ViewerModel, ViewerQuery } from "./load-viewer";
import type { ConstitutionHistoryItem } from "../../../lib/constitution-history";
import type { ViewerLocation } from "../../../lib/constitution-viewer";

function requestedSnapshots(query: ViewerQuery, owner: string) {
  const ids = new Set<string>(query.sourceVersion ? [query.sourceVersion] : []);
  try {
    const viewed = JSON.parse(query.viewed ?? "null");
    if (!viewed?.href?.startsWith(owner + "/")) return ids;
    const url = new URL(viewed.href, "https://atlas.invalid");
    if (viewed.kind === "version")
      ids.add(url.pathname.slice(url.pathname.lastIndexOf("/") + 1));
    if (viewed.kind === "comparison")
      for (const key of ["from", "to"]) {
        const id = url.searchParams.get(key);
        if (id) ids.add(id);
      }
  } catch {
    /* Malformed bookmarks carry no additional snapshot context. */
  }
  return ids;
}

export async function historySnapshotAliases(
  model: ViewerModel,
  query: ViewerQuery,
) {
  const aliases: Record<string, string> = {};
  const unknown = [...requestedSnapshots(query, model.owner)].filter(
    (id) =>
      !model.versions.some((v) => v.id === id || snapshotVersionId(v) === id),
  );
  await Promise.all(
    unknown.map(async (id) => {
      const snapshot = await getVersion(id).catch(() => null);
      if (
        snapshot?.publicationStatus !== "published" ||
        snapshot.constitutionId !== model.constitution.id
      )
        return;
      const legal = model.versions.find(
        (v) =>
          (v.legalVersionId ?? v.id) ===
          (snapshot.legalVersionId ?? snapshot.id),
      );
      if (legal) aliases[id] = legal.id;
    }),
  );
  return aliases;
}

export async function historyPassageScope(
  query: ViewerQuery,
  knownSource: (id: string | undefined) => boolean,
) {
  const scope = new Set<string>(query.passage ? [query.passage] : []);
  const initial = {
    scope,
    scopeLabel: query.passage ?? "",
    scopeUnavailable: false,
  };
  if (
    !query.passage ||
    !query.sourceVersion ||
    !knownSource(query.sourceVersion)
  )
    return initial;
  const articles = await listAllUnits(query.sourceVersion, true).catch(
    () => null,
  );
  if (!articles) return { ...initial, scopeUnavailable: true };
  const article = articles.find(
    (a) => a.logicalId === query.passage || a.id === query.passage,
  );
  if (!article) {
    const passage = await resolveUnit(query.sourceVersion, query.passage).catch(
      () => null,
    );
    return passage
      ? { ...initial, scopeLabel: passage.pathLabels.join(" › ") }
      : { ...initial, scopeUnavailable: true };
  }
  for (const id of Object.keys(orderedTargets([article]))) scope.add(id);
  return {
    ...initial,
    scopeLabel: [article.articleNumber, article.title]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Include descendants added after the source edition, using Content's pinned logical ancestry. */
export async function expandHistoryPassageScope(
  amendments: Amendment[],
  scope: Set<string>,
) {
  const refs = new Map<string, AmendmentUnitRef>();
  for (const amendment of amendments)
    for (const change of amendment.changes) {
      for (const ref of [change.beforeRef, change.afterRef])
        if (ref?.versionId && ref.logicalId && !scope.has(ref.logicalId))
          refs.set(ref.versionId + ":" + ref.logicalId, ref);
    }
  const pending = [...refs.values()];
  let unavailable = false;
  for (let offset = 0; offset < pending.length; offset += 6) {
    const batch = pending.slice(offset, offset + 6);
    const results = await Promise.all(
      batch.map((ref) =>
        resolveUnit(ref.versionId!, ref.logicalId!).catch(() => null),
      ),
    );
    results.forEach((resolved, index) => {
      if (!resolved?.breadcrumbs) {
        unavailable = true;
        return;
      }
      if (
        resolved.logicalId === batch[index].logicalId &&
        resolved.breadcrumbs.some((id) => scope.has(id))
      )
        scope.add(resolved.logicalId);
    });
    if (results.every((result) => result === null)) break;
  }
  return unavailable;
}

export function matchesHistoryFilters(
  item: ConstitutionHistoryItem,
  query: ViewerQuery,
) {
  if (query.kind && item.kind !== query.kind) return false;
  if (query.year && !item.date.startsWith(query.year)) return false;
  if (!query.q) return true;
  const passages =
    item.amendment?.changes
      .map((c) => c.articleNumber + " " + c.note)
      .join(" ") ?? "";
  return `${item.title} ${item.summary ?? ""} ${passages}`
    .toLocaleLowerCase()
    .includes(query.q.toLocaleLowerCase());
}

export function historyItemMarker(
  viewed: ViewerLocation | null,
  item: ConstitutionHistoryItem,
  aliases: Record<string, string>,
) {
  const matches = (id: string | undefined) =>
    Boolean(id && (id === item.id || (aliases[id] ?? id) === item.version?.id));
  const isCurrent = viewed?.kind === item.kind && matches(viewed.id);
  let endpoint: "start" | "end" | undefined;
  if (viewed?.kind === "comparison") {
    if (matches(viewed.from)) endpoint = "start";
    else if (matches(viewed.to)) endpoint = "end";
  }
  return { isCurrent, endpoint };
}
