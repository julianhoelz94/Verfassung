import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadConstitutionCollection } from "../../../../lib/country-directory";
import {
  getVersion,
  getReaderOutline,
  listAllUnits,
  listConstitutionAmendments,
  type Amendment,
  type VersionSummary,
} from "../../../../lib/api";
import {
  canonicalCompareQuery,
  compareRequestError,
  orderVersions,
  versionPath,
} from "../../../../lib/compare";
import {
  publicVersions,
  publicVersionForSnapshot,
  snapshotVersionId,
} from "../../../../lib/reading";
import { currentLocale } from "../../../../lib/server-locale";
import { ui } from "../../../../lib/messages";
import {
  atlasTitle,
  metaDescription,
  pageMetadata,
} from "../../../../lib/page-meta";
import { ReaderPage } from "../../../components/layout/templates";
import { ServiceUnavailable } from "../../../components/StatusMessage";
import { ConsolidatedComparisonView } from "../../../components/history/ConsolidatedComparisonView";
import { CompareForm } from "../CompareForm";
import type { ViewerQuery } from "../../../components/history/load-viewer";

export type ComparePageProps = {
  params: Promise<{ code?: string; id?: string }>;
  searchParams: Promise<ViewerQuery>;
};
export async function generateMetadata(
  props: ComparePageProps,
): Promise<Metadata> {
  const params = await props.params;
  const query = await props.searchParams;
  try {
    const context = await loadConstitutionCollection(params);
    if (!context) return { title: atlasTitle("Compare") };
    const { collection, owner } = context;
    const requested = [query.from, query.to];
    const snapshots = await Promise.all(
      requested.map((id) =>
        id &&
        !collection.constitutions.some((item) =>
          item.versions.some(
            (version) => version.id === id || snapshotVersionId(version) === id,
          ),
        )
          ? getVersion(id)
          : undefined,
      ),
    );
    const constitution =
      collection.constitutions.find(
        (item) =>
          item.versions.some((version) =>
            requested.some(
              (id) => id === version.id || id === snapshotVersionId(version),
            ),
          ) ||
          snapshots.some((snapshot) => snapshot?.constitutionId === item.id),
      ) ?? collection.constitutions[0];
    const versions = orderVersions(
      publicVersions(constitution?.versions ?? []),
    );
    const selected = requested.map((id, index) =>
      id
        ? versions.find(
            (version) =>
              version.id === id ||
              snapshotVersionId(version) === id ||
              (snapshots[index]?.constitutionId === constitution?.id &&
                (snapshots[index]?.legalVersionId ?? snapshots[index]?.id) ===
                  (version.legalVersionId ?? version.id)),
          )
        : index === 0
          ? versions[0]
          : versions[versions.length - 1],
    );
    const canonical = canonicalCompareQuery(
      selected[0]?.id,
      selected[1]?.id,
      versions,
    );
    const fromId =
      query.from ?? (selected[0] ? snapshotVersionId(selected[0]) : undefined);
    const toId =
      query.to ?? (selected[1] ? snapshotVersionId(selected[1]) : undefined);
    return pageMetadata({
      title: atlasTitle(
        `Compare ${selected[0]?.versionLabel ?? "…"} → ${selected[1]?.versionLabel ?? "…"}`,
        collection.name,
      ),
      description: metaDescription(
        `Compare constitutional versions for ${collection.name}.`,
      ),
      path:
        canonical && fromId && toId
          ? `${owner.href}/compare?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`
          : `${owner.href}/compare`,
    });
  } catch {
    return { title: atlasTitle("Compare") };
  }
}

/** Compose published endpoints independently of optional amendment provenance. */
export default async function ComparePage({
  params,
  searchParams,
}: ComparePageProps) {
  const [values, query, locale] = await Promise.all([
    params,
    searchParams,
    currentLocale(),
  ]);
  const context = await loadConstitutionCollection(values).catch(
    () => undefined,
  );
  const fallback = values.id
    ? `/jurisdictions/${values.id}`
    : `/countries/${values.code}`;
  if (context === undefined)
    return (
      <ReaderPage>
        <ServiceUnavailable
          service={ui.services.catalog}
          retryHref={fallback + "/compare"}
        />
      </ReaderPage>
    );
  if (!context) notFound();
  const { collection, owner } = context;
  const snapshots = await Promise.all(
    [query.from, query.to].map((id) =>
      id ? getVersion(id).catch(() => null) : null,
    ),
  );
  const constitution =
    collection.constitutions.find(
      (c) => c.id === snapshots.find(Boolean)?.constitutionId,
    ) ??
    collection.constitutions.find((c) =>
      c.versions.some((v) =>
        [v.id, snapshotVersionId(v)].some(
          (id) => id === query.from || id === query.to,
        ),
      ),
    ) ??
    collection.constitutions[0];
  if (!constitution) notFound();
  const versions = orderVersions(publicVersions(constitution.versions));
  const selected = [query.from, query.to].map((id, index) =>
    id
      ? publicVersionForSnapshot(
          constitution.versions,
          snapshots[index]?.legalVersionId ?? id,
        )
      : index === 0
        ? versions[0]
        : versions.at(-1),
  );
  const error = compareRequestError(
    collection.constitutions,
    selected[0]?.id,
    selected[1]?.id,
    locale,
  );
  const path =
    selected[0] && selected[1]
      ? versionPath(versions, selected[0].id, selected[1].id)
      : null;
  const privateSnapshot = snapshots.some(
    (snapshot) =>
      snapshot &&
      (snapshot.publicationStatus !== "published" ||
        snapshot.constitutionId !== constitution.id),
  );
  const fromId =
      query.from ?? (selected[0] ? snapshotVersionId(selected[0]) : ""),
    toId = query.to ?? (selected[1] ? snapshotVersionId(selected[1]) : "");
  const formVersions = versions.map((v) => ({
    ...v,
    id: snapshotVersionId(v),
  }));
  if (
    error ||
    !path ||
    privateSnapshot ||
    [query.from, query.to].some(
      (id, index) =>
        id &&
        !snapshots[index] &&
        !versions.some((v) => snapshotVersionId(v) === id || v.id === id),
    )
  )
    return (
      <ReaderPage>
        <h1>
          {locale === "de" ? "Fassungen vergleichen" : "Compare legal versions"}
        </h1>
        <CompareForm
          code={collection.isoCode}
          actionHref={owner.href + "/compare"}
          versions={formVersions}
          fromId={fromId}
          toId={toId}
        />
        <p role="alert">
          {error ??
            (locale === "de"
              ? "Wählen Sie zwei veröffentlichte Fassungen derselben Verfassung."
              : "Choose two published versions of the same constitution.")}
        </p>
      </ReaderPage>
    );
  const endpoints = await Promise.all([
    listAllUnits(fromId, true),
    listAllUnits(toId, true),
  ]).catch(() => null);
  if (!endpoints)
    return (
      <ReaderPage>
        <ServiceUnavailable
          service={ui.services.content}
          retryHref={`${owner.href}/compare?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`}
        />
      </ReaderPage>
    );
  const [fromOutline, toOutline, records] = await Promise.all([
    getReaderOutline(fromId).catch(() => undefined),
    getReaderOutline(toId).catch(() => undefined),
    listConstitutionAmendments(constitution.id).catch(() => null),
  ]);
  const provenance = await intervalAmendments(records ?? [], versions, path);
  return ConsolidatedComparisonView({
    params: values,
    constitutionId: constitution.id,
    query,
    versions,
    from: path[0],
    to: path[path.length - 1],
    fromId,
    toId,
    before: endpoints[0],
    after: endpoints[1],
    amendments: provenance.amendments,
    fromOutline: fromOutline ?? constitution.contentOutline,
    toOutline: toOutline ?? constitution.contentOutline,
    incomplete: records === null || provenance.incomplete,
  });
}

/** Map exact source pins to legal identities without replacing the pins on their records. */
async function intervalAmendments(
  records: Amendment[],
  versions: VersionSummary[],
  path: VersionSummary[],
) {
  const aliases = new Map(
    versions.flatMap((v) => [
      [v.id, v.id],
      [snapshotVersionId(v), v.id],
      [v.legalVersionId ?? v.id, v.id],
    ]),
  );
  const pins = [
    ...new Set(
      records
        .flatMap((a) => [a.sourceVersionId, a.targetVersionId])
        .filter((id): id is string => Boolean(id) && !aliases.has(id!)),
    ),
  ];
  const snapshots = await Promise.all(
    pins.map((id) => getVersion(id).catch(() => null)),
  );
  for (const snapshot of snapshots)
    if (snapshot) {
      const legal = aliases.get(snapshot.legalVersionId ?? snapshot.id);
      if (legal) aliases.set(snapshot.id, legal);
    }
  const positions = new Map(path.map((v, index) => [v.id, index]));
  const mapped = records
    .map((amendment) => ({
      amendment,
      source: aliases.get(amendment.sourceVersionId ?? ""),
      target: aliases.get(amendment.targetVersionId ?? ""),
    }))
    .filter(
      (row) =>
        (row.amendment.status == null ||
          row.amendment.status === "published") &&
        row.source != null &&
        row.target != null &&
        positions.has(row.source) &&
        positions.has(row.target) &&
        positions.get(row.source)! < positions.get(row.target)!,
    )
    .sort((a, b) => positions.get(a.source!)! - positions.get(b.source!)!);
  const incomplete =
    path
      .slice(1)
      .some(
        (v, index) =>
          !mapped.some(
            (row) => row.source === path[index].id && row.target === v.id,
          ),
      ) ||
    mapped.some((row) =>
      row.amendment.changes.some(
        (change) =>
          (!change.beforeRef?.logicalId && !change.afterRef?.logicalId) ||
          change.legacyLinkUnresolved ||
          Boolean(change.linkReviewReason),
      ),
    );
  return { amendments: mapped.map((row) => row.amendment), incomplete };
}
