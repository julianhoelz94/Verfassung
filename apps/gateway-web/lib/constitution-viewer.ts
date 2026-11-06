import type { Amendment, ConstitutionSummary, VersionSummary } from "./api";
import { safeReturnTo } from "./return-to";
import { snapshotVersionId } from "./reading";

export type ViewerLocation = {
  kind: "version" | "amendment" | "event" | "comparison";
  href: string;
  label: string;
  id?: string;
  from?: string;
  to?: string;
};

export function historyHref(
  owner: string,
  constitutionId: string,
  viewed?: ViewerLocation,
  extra?: Record<string, string>,
) {
  const query = new URLSearchParams(extra);
  if (viewed) query.set("viewed", JSON.stringify(viewed));
  return `${owner}/constitutions/${encodeURIComponent(constitutionId)}${query.size ? "?" + query : ""}`;
}

/** Accept only local destinations belonging to this constitution's published viewers. */
export function parseViewerLocation(
  value: string | undefined,
  owner: string,
  constitution: ConstitutionSummary,
  amendments: Amendment[],
  eventIds: string[],
  aliases: Record<string, string> = {},
): ViewerLocation | null {
  try {
    const item = JSON.parse(value ?? "null") as ViewerLocation | null;
    if (
      !item ||
      typeof item.href !== "string" ||
      typeof item.label !== "string" ||
      !safeViewerReturn(item.href, owner)
    )
      return null;
    const url = new URL(item.href, "https://atlas.invalid");
    if (
      url.origin !== "https://atlas.invalid" ||
      !item.href.startsWith(owner + "/")
    )
      return null;
    const root = `${owner}/constitutions/${constitution.id}`;
    if (item.kind === "version") {
      const id = url.pathname.startsWith(owner + "/versions/")
        ? url.pathname.slice((owner + "/versions/").length)
        : "";
      const version = constitution.versions.find(
        (v) =>
          id === v.id || id === snapshotVersionId(v) || aliases[id] === v.id,
      );
      return version
        ? { kind: "version", href: item.href, label: version.versionLabel, id }
        : null;
    }
    if (item.kind === "amendment") {
      const amendment = amendments.find(
        (a) => url.pathname === `${root}/amendments/${a.id}`,
      );
      return amendment
        ? {
            kind: "amendment",
            href: item.href,
            label: amendment.title,
            id: amendment.id,
          }
        : null;
    }
    if (
      item.kind === "event" &&
      eventIds.includes(item.id ?? "") &&
      url.pathname === `${root}/events/${item.id}`
    )
      return item;
    if (item.kind === "comparison" && url.pathname === `${owner}/compare`) {
      const fromId = url.searchParams.get("from") ?? "",
        toId = url.searchParams.get("to") ?? "";
      const from = constitution.versions.find(
        (v) =>
          v.id === fromId ||
          snapshotVersionId(v) === fromId ||
          aliases[fromId] === v.id,
      );
      const to = constitution.versions.find(
        (v) =>
          v.id === toId ||
          snapshotVersionId(v) === toId ||
          aliases[toId] === v.id,
      );
      if (from && to && from.id !== to.id)
        return {
          kind: "comparison",
          href: item.href,
          from: fromId,
          to: toId,
          label: `${from.versionLabel} → ${to.versionLabel}`,
        };
    }
  } catch {
    /* Malformed bookmarks do not grant or invent a reading context. */
  }
  return null;
}

export function versionLocation(
  owner: string,
  version: VersionSummary,
  snapshotId = snapshotVersionId(version),
): ViewerLocation {
  return {
    kind: "version",
    id: snapshotId,
    href: `${owner}/versions/${snapshotId}`,
    label: version.versionLabel,
  };
}

export function safeViewerReturn(
  value: string | undefined,
  owner: string,
): string | undefined {
  const normalized = safeReturnTo(value ?? "", "");
  if (!normalized || !normalized.startsWith(owner + "/")) return undefined;
  return normalized;
}

/** Return paths carry task state, but never recursively embed previous reading contexts. */
export function recordReturn(
  value: string | undefined,
  owner: string,
): string | undefined {
  const safe = safeViewerReturn(value, owner);
  if (!safe) return undefined;
  const url = new URL(safe, "https://atlas.invalid");
  url.searchParams.delete("viewed");
  url.searchParams.delete("return");
  return url.pathname + url.search + url.hash;
}

/** Save a bounded comparison context while retaining the originating History filters. */
export function comparisonLocations(
  owner: string,
  constitutionId: string,
  from: { id: string; label: string },
  to: { id: string; label: string },
  query: Record<string, string | undefined>,
) {
  const canonical = new URLSearchParams({ from: from.id, to: to.id });
  for (const key of ["passage", "q", "reversed", "all"])
    if (query[key]) canonical.set(key, query[key]!);
  const previous = recordReturn(query.return, owner);
  const base = `${owner}/constitutions/${constitutionId}`;
  const filters: Record<string, string> = {
    compareFrom: from.id,
    compareTo: to.id,
  };
  const previousUrl = previous
    ? new URL(previous, "https://atlas.invalid")
    : null;
  if (previousUrl?.pathname === base) {
    for (const key of [
      "passage",
      "sourceVersion",
      "sourceAnchor",
      "kind",
      "year",
      "q",
    ]) {
      const value = previousUrl.searchParams.get(key);
      if (value) filters[key] = value;
    }
    canonical.set("return", previous!);
  }
  const href = `${owner}/compare?${canonical}`;
  const history = historyHref(
    owner,
    constitutionId,
    {
      kind: "comparison",
      href,
      label: `${from.label} → ${to.label}`,
      from: from.id,
      to: to.id,
    },
    filters,
  );
  return {
    href,
    history,
    returnTo:
      previousUrl && previousUrl.pathname !== base ? previous! : history,
  };
}
