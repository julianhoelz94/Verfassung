import type {
  Amendment,
  AmendmentChange,
  ArticleSummary,
  OrderedEntry,
} from "./api";
import { orderedText } from "./ordered-content";

export type IndexedPassage = {
  id: string;
  label: string;
  text: string;
  signature: string;
  parents: string[];
  order: number;
  article?: ArticleSummary;
  entry?: OrderedEntry;
};
export type PassageProvenance = {
  amendment: Amendment;
  change: AmendmentChange;
};
export type ConsolidatedPassage = {
  id: string;
  label: string;
  before?: IndexedPassage;
  after?: IndexedPassage;
  kind: "added" | "removed" | "changed" | "reversed";
  provenance: PassageProvenance[];
  orderChanged?: boolean;
};

/** Drop snapshot-specific storage identities; authored order, marks, links and structure remain significant. */
function authored(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(authored);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "id",
              "versionId",
              "predecessorId",
              "revisionId",
              "occurrenceId",
              "rootOccurrenceId",
              "annotation",
            ].includes(key),
        )
        .map(([key, item]) => [key, authored(item)]),
    );
  return value;
}

function scopeProperties(passage: IndexedPassage): unknown {
  const article = passage.article,
    node = passage.entry?.node;
  return {
    kind: article?.kind ?? node?.kind,
    label: article?.articleNumber ?? node?.label,
    title: article?.title ?? node?.title,
    lineBreaksBefore: passage.entry?.lineBreaksBefore,
  };
}

function samePassage(
  left: IndexedPassage | undefined,
  right: IndexedPassage | undefined,
) {
  return (
    left?.signature === right?.signature &&
    JSON.stringify(left?.parents) === JSON.stringify(right?.parents)
  );
}
function reordered(left: IndexedPassage, right: IndexedPassage) {
  const ids = (passage: IndexedPassage) =>
    (passage.article?.content ?? passage.entry?.node?.content ?? []).map(
      (entry) => entry.node?.logicalId ?? entry.logicalId,
    );
  const before = ids(left),
    after = ids(right);
  return (
    before.length === after.length &&
    JSON.stringify([...before].sort()) === JSON.stringify([...after].sort()) &&
    JSON.stringify(before) !== JSON.stringify(after)
  );
}

export function indexPassages(
  articles: ArticleSummary[],
): Map<string, IndexedPassage> {
  const result = new Map<string, IndexedPassage>();
  function entries(items: OrderedEntry[], parents: string[], path: string[]) {
    for (const [position, entry] of items.entries()) {
      const node = entry.node,
        id = node?.logicalId ?? entry.logicalId;
      if (!id) continue;
      const segment = node
        ? [node.kind, node.label, node.title].filter(Boolean).join(" ")
        : "";
      const label = node
        ? [...path, segment].filter(Boolean).join(" › ")
        : path.join(" › ") +
          (items.filter((item) => !item.node).length > 1
            ? " · Text " + (position + 1)
            : "");
      result.set(id, {
        id,
        label: label || id,
        text: node ? orderedText(node.content) : (entry.text ?? ""),
        signature: JSON.stringify(authored(entry)),
        parents,
        order: result.size,
        entry,
      });
      if (node) entries(node.content, [...parents, id], [...path, segment]);
    }
  }
  for (const article of articles) {
    const id =
      (article.legacyIdentity ? undefined : article.logicalId) ??
      `legacy:${article.kind ?? "article"}:${article.articleNumber}`;
    const label = [article.articleNumber, article.title]
      .filter(Boolean)
      .join(" · ");
    result.set(id, {
      id,
      label,
      text:
        article.content != null
          ? orderedText(article.content)
          : (article.body ?? ""),
      signature: JSON.stringify(
        authored({
          kind: article.kind,
          label: article.articleNumber,
          title: article.title,
          body: article.body,
          content: article.content,
          children: article.content == null ? article.children : undefined,
        }),
      ),
      parents: [],
      order: result.size,
      article,
    });
    if (!article.legacyIdentity) entries(article.content ?? [], [id], [label]);
  }
  return result;
}

/** Compare common roots only: inserting a new article does not move all later articles. */
function reorderedRoots(
  before: Map<string, IndexedPassage>,
  after: Map<string, IndexedPassage>,
): Set<string> {
  const shared = (
    source: Map<string, IndexedPassage>,
    other: Map<string, IndexedPassage>,
  ) =>
    [...source.values()]
      .filter((passage) => passage.article && other.get(passage.id)?.article)
      .map((passage) => passage.id);
  const left = shared(before, after),
    right = shared(after, before);
  return new Set(left.filter((id, index) => id !== right[index]));
}

/** Endpoint snapshots determine the net result. Amendment records supply provenance only. */
export function consolidatePassages(
  beforeArticles: ArticleSummary[],
  afterArticles: ArticleSummary[],
  amendments: Amendment[],
): ConsolidatedPassage[] {
  const before = indexPassages(beforeArticles),
    after = indexPassages(afterArticles);
  const recorded = new Set(
    amendments.flatMap((a) =>
      a.changes.flatMap((c) =>
        [c.beforeRef?.logicalId, c.afterRef?.logicalId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  );
  const rootMoves = reorderedRoots(before, after);
  const candidates = new Set([...recorded, ...rootMoves]);
  // Capture endpoint changes even where an intermediate amendment record is missing.
  for (const [id, passage] of new Map([...before, ...after])) {
    const left = before.get(id),
      right = after.get(id);
    if (samePassage(left, right)) continue;
    const node = passage.entry?.node;
    const hasChildren = Boolean(
      (passage.article?.content ?? node?.content)?.some(
        (e) => e.node || e.type === "text",
      ),
    );
    const propertiesChanged =
      left &&
      right &&
      JSON.stringify(scopeProperties(left)) !==
        JSON.stringify(scopeProperties(right));
    if (
      !left ||
      !right ||
      !hasChildren ||
      propertiesChanged ||
      (left && right && reordered(left, right))
    )
      candidates.add(id);
  }
  const ids = [...candidates].filter(
    (id) =>
      !(after.get(id) ?? before.get(id))?.parents.some((parent) =>
        candidates.has(parent),
      ),
  );
  return ids
    .map((id) => {
      const left = before.get(id),
        right = after.get(id);
      const provenance = amendments.flatMap((amendment) =>
        amendment.changes
          .filter((change) =>
            [change.beforeRef?.logicalId, change.afterRef?.logicalId].some(
              (ref) =>
                ref &&
                (ref === id ||
                  (before.get(ref) ?? after.get(ref))?.parents.includes(id)),
            ),
          )
          .map((change) => ({ amendment, change })),
      );
      const kind: ConsolidatedPassage["kind"] =
        samePassage(left, right) && !rootMoves.has(id)
          ? "reversed"
          : !left
            ? "added"
            : !right
              ? "removed"
              : "changed";
      return {
        id,
        label:
          right?.label ??
          left?.label ??
          provenance[0]?.change.afterRef?.label ??
          provenance[0]?.change.beforeRef?.label ??
          id,
        before: left,
        after: right,
        kind,
        provenance,
        orderChanged: rootMoves.has(id),
      };
    })
    .filter((row) => row.kind !== "reversed" || row.provenance.length > 0)
    .sort(
      (a, b) =>
        (a.after?.order ?? a.before?.order ?? Number.MAX_SAFE_INTEGER) -
        (b.after?.order ?? b.before?.order ?? Number.MAX_SAFE_INTEGER),
    );
}
