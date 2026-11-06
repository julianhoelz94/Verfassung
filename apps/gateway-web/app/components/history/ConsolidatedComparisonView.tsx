import { DocumentView } from "../DocumentViewOptions";
import type {
  Amendment,
  ArticleSummary,
  ContentOutline,
  VersionSummary,
} from "../../../lib/api";
import {
  consolidatePassages,
  type IndexedPassage,
  type ConsolidatedPassage,
} from "../../../lib/consolidated-comparison";
import { comparisonLocations } from "../../../lib/constitution-viewer";
import { versionPath } from "../../../lib/compare";
import { snapshotVersionId } from "../../../lib/reading";
import { FullWidthPage } from "../layout/PageChrome";
import { ConstitutionViewer } from "./ConstitutionViewer";
import {
  ViewerUnavailable,
  loadViewer,
  type ViewerParams,
  type ViewerQuery,
} from "./load-viewer";
import { footnoteItems } from "../../../lib/footnotes";
import { orderedTargets } from "../../../lib/ordered-content";
import type { ConstitutionCrossRefs } from "../ConstitutionText";
import { DiffConstitutionText } from "../DiffConstitutionText";
import { PassageChange } from "./PassageChange";
import { FormattedDate } from "../../../lib/format-date";
import { ComparisonEvidence } from "./ComparisonEvidence";
import styles from "./ConstitutionHistory.module.css";

function asArticle(
  passage: IndexedPassage | undefined,
  versionId: string,
): ArticleSummary | undefined {
  if (!passage) return undefined;
  return (
    passage.article ?? {
      versionId,
      id:
        passage.entry?.occurrenceId ??
        passage.entry?.node?.occurrenceId ??
        passage.id,
      logicalId: passage.id,
      articleNumber: "",
      title: "",
      body: passage.text,
      sortOrder: passage.order,
      content: passage.entry ? [passage.entry] : undefined,
    }
  );
}

export async function ConsolidatedComparisonView({
  params,
  constitutionId,
  query,
  versions,
  from,
  to,
  fromId,
  toId,
  before,
  after,
  amendments,
  fromOutline,
  toOutline,
  incomplete,
}: {
  params: Omit<ViewerParams, "constitutionId">;
  constitutionId: string;
  query: ViewerQuery;
  versions: VersionSummary[];
  from: VersionSummary;
  to: VersionSummary;
  fromId: string;
  toId: string;
  before: ArticleSummary[];
  after: ArticleSummary[];
  amendments: Amendment[];
  fromOutline?: ContentOutline;
  toOutline?: ContentOutline;
  incomplete: boolean;
}) {
  const model = await loadViewer({ ...params, constitutionId });
  if (!model)
    return <ViewerUnavailable params={{ ...params, constitutionId }} />;
  const t = (en: string, de: string) => (model.locale === "de" ? de : en);
  const unmapped = amendments.flatMap((amendment) =>
    amendment.changes
      .filter(
        (change) =>
          (!change.beforeRef?.logicalId && !change.afterRef?.logicalId) ||
          change.legacyLinkUnresolved ||
          change.linkReviewReason,
      )
      .map((change) => ({ amendment, change })),
  );
  const references = (versionId: string, articles: ArticleSummary[]) => ({
    ...(params.id ? { jurisdictionId: params.id } : { code: params.code }),
    versionId,
    articlesByNumber: Object.fromEntries(
      articles.map((a) => [a.articleNumber, a.id]),
    ),
    unitsByLogicalId: orderedTargets(articles),
    footnotes: footnoteItems(
      articles.flatMap((a) => a.content ?? []),
      model.owner + "/versions/" + versionId,
    ),
  });
  const fromReferences = references(fromId, before),
    toReferences = references(toId, after);
  const columnModel = {
    owner: model.owner,
    from,
    to,
    fromId,
    toId,
    fromOutline,
    toOutline,
    fromReferences,
    toReferences,
    t,
  };
  const rows = consolidatePassages(before, after, amendments),
    net = rows.filter((r) => r.kind !== "reversed"),
    reversed = rows.filter((r) => r.kind === "reversed");
  const includeReversed = query.reversed === "1" || query.all === "1";
  const scope = query.passage,
    scoped = rows.filter(
      (row) =>
        !scope ||
        row.id === scope ||
        row.before?.parents.includes(scope) ||
        row.after?.parents.includes(scope),
    );
  const visible = scoped.filter(
    (row) =>
      (includeReversed || row.kind !== "reversed") &&
      (!query.q ||
        `${row.label} ${row.before?.text ?? ""} ${row.after?.text ?? ""} ${row.provenance.map((p) => p.amendment.title + " " + p.change.note).join(" ")}`
          .toLocaleLowerCase()
          .includes(query.q.toLocaleLowerCase())),
  );
  const { href, history, returnTo } = comparisonLocations(
    model.owner,
    constitutionId,
    { id: fromId, label: from.versionLabel },
    { id: toId, label: to.versionLabel },
    query,
  );
  const navigation = (
    <nav
      className={styles.nav}
      aria-label={t(
        "Passages in this comparison",
        "Passagen in diesem Vergleich",
      )}
    >
      <p className={styles.eyebrow}>
        {t("In this comparison", "In diesem Vergleich")}
      </p>
      <h2>{t("Passages", "Passagen")}</h2>
      {visible.map((row) => (
        <a key={row.id} href={"#compare-" + row.id}>
          {row.label}
          <small>
            {t(
              {
                added: "Added",
                removed: "Removed",
                changed: "Changed",
                reversed: "No net change",
              }[row.kind],
              {
                added: "Hinzugefügt",
                removed: "Entfernt",
                changed: "Geändert",
                reversed: "Keine Nettoänderung",
              }[row.kind],
            )}
          </small>
        </a>
      ))}
    </nav>
  );
  const options = versions.map((v) => ({
    id: snapshotVersionId(v),
    label: v.versionLabel,
  }));
  for (const [id, version] of [
    [fromId, from],
    [toId, to],
  ] as const)
    if (!options.some((option) => option.id === id))
      options.push({
        id,
        label:
          version.versionLabel +
          " · " +
          t("Pinned transcription", "Fixierte Textrevision"),
      });
  const keepQuery = (exclude: string[]) =>
    Object.entries(query)
      .filter(([key, value]) => value && !exclude.includes(key))
      .map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ));
  return (
    <FullWidthPage template="reader">
      <ConstitutionViewer
        breadcrumbs={model.breadcrumbs}
        mode="compare"
        readHref={href}
        historyHref={history}
        wiki={model.wiki}
        details={model.details}
        navigation={navigation}
      >
        <div id="comparison">
          <p>
            <a href={returnTo}>
              ← {t("Back to History", "Zurück zur Geschichte")}
            </a>
          </p>
          <p className={styles.eyebrow}>
            {model.constitution.title} ·{" "}
            {t("Consolidated comparison", "Zusammengefasster Vergleich")}
          </p>
          <h1>
            {from.versionLabel} → {to.versionLabel}
          </h1>
          <p className={styles.lede}>
            {t(
              "The combined change between two legal versions. Each passage appears once; the acts behind it remain traceable.",
              "Die zusammengefasste Änderung zwischen zwei rechtlichen Fassungen. Jede Passage erscheint einmal; die zugrunde liegenden Änderungen bleiben nachvollziehbar.",
            )}
          </p>
        </div>
        <form className={styles.picker} action={`${model.owner}/compare`}>
          <div className={styles.range}>
            <label>
              {t("Starting version", "Ausgangsfassung")}
              <select name="from" defaultValue={fromId}>
                {options.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Ending version", "Zielfassung")}
              <select name="to" defaultValue={toId}>
                {options.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {keepQuery(["from", "to"])}
          <p>
            <button>{t("Update comparison", "Vergleich aktualisieren")}</button>
          </p>
        </form>
        <p>
          {(versionPath(versions, from.id, to.id) ?? []).map((v, index) => (
            <span key={v.id}>
              {index ? " → " : ""}
              <a href={`${model.owner}/versions/${snapshotVersionId(v)}`}>
                {v.versionLabel}
              </a>
            </span>
          ))}
        </p>
        <div className={styles.stats}>
          <div>
            <strong>{net.length}</strong>
            <small>
              {t("net changed passages", "Passagen mit Nettoänderung")}
            </small>
          </div>
          <div>
            <strong>{amendments.length}</strong>
            <small>
              {t("contributing amendments", "beitragende Änderungen")}
            </small>
          </div>
          <div>
            <strong>{reversed.length}</strong>
            <small>
              {t("changes later reversed", "später zurückgenommene Änderungen")}
            </small>
          </div>
        </div>
        {incomplete ? (
          <p className={styles.missing} role="status">
            {t(
              "Amendment attribution is incomplete for this interval. The endpoint texts still determine the net changes shown below.",
              "Die Zuordnung zu Änderungen ist für diesen Zeitraum unvollständig. Die Nettoänderungen unten ergeben sich weiterhin aus den Texten der beiden Fassungen.",
            )}
          </p>
        ) : null}
        <form className={styles.filters} action={`${model.owner}/compare`}>
          {keepQuery(["q", "reversed", "all"])}
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            aria-label={t(
              "Find an article, passage or act",
              "Artikel, Passage oder Gesetz suchen",
            )}
            placeholder={t(
              "Find an article, passage or act…",
              "Artikel, Passage oder Gesetz suchen…",
            )}
          />
          <label>
            <input
              type="checkbox"
              name="reversed"
              value="1"
              defaultChecked={includeReversed}
            />{" "}
            {t(
              "Include changes later reversed",
              "Später zurückgenommene Änderungen einschließen",
            )}{" "}
            ({reversed.length})
          </label>
          <button>{t("Filter", "Filtern")}</button>
        </form>
        {visible.map((row, position) => {
          const left = asArticle(row.before, fromId),
            right = asArticle(row.after, toId);
          return (
            <section
              key={row.id}
              className={styles.change}
              id={"compare-" + row.id}
            >
              <p className={styles.eyebrow}>
                {row.kind === "reversed"
                  ? t("No net change", "Keine Nettoänderung")
                  : t(
                      {
                        added: "Added",
                        removed: "Removed",
                        changed: "Changed",
                      }[row.kind],
                      {
                        added: "Hinzugefügt",
                        removed: "Entfernt",
                        changed: "Geändert",
                      }[row.kind],
                    )}
              </p>
              <h2>{row.label}</h2>
              {row.orderChanged ? (
                <p>
                  {t(
                    "Position in the constitution changed.",
                    "Die Position in der Verfassung hat sich geändert.",
                  )}
                </p>
              ) : null}
              {row.kind === "reversed" ? (
                <p>
                  {t(
                    "The passage has the same state at both endpoints. Its intermediate changes remain available below.",
                    "Die Passage hat in beiden Fassungen denselben Zustand. Ihre zwischenzeitlichen Änderungen stehen unten.",
                  )}
                </p>
              ) : (
                <div className={styles.columns}>
                  {(["from", "to"] as const).map((side) =>
                    comparisonColumn(
                      side,
                      row,
                      left,
                      right,
                      columnModel,
                      position + 1,
                    ),
                  )}
                </div>
              )}
              <details className={styles.provenance}>
                <summary>
                  {t(
                    "How this passage changed",
                    "Wie sich diese Passage änderte",
                  )}{" "}
                  · {row.provenance.length}{" "}
                  {t("recorded changes", "dokumentierte Änderungen")}
                </summary>
                <ol>
                  {row.provenance.map(({ amendment, change }) => (
                    <li key={amendment.id + ":" + change.id}>
                      <p>
                        <a
                          href={`${model.base}/amendments/${amendment.id}?return=${encodeURIComponent(href)}#change-${change.id}`}
                        >
                          {amendment.title}
                        </a>{" "}
                        ·{" "}
                        <FormattedDate
                          value={amendment.effectiveOn ?? amendment.enactedOn}
                        />
                      </p>
                      {amendment.comment ? <p>{amendment.comment}</p> : null}
                      <PassageChange change={change} compact />
                    </li>
                  ))}
                </ol>
                {!row.provenance.length ? (
                  <p>
                    {t(
                      "No exact amendment mapping is available for this passage.",
                      "Für diese Passage ist keine genaue Änderungszuordnung verfügbar.",
                    )}
                  </p>
                ) : null}
                <ComparisonEvidence provenance={row.provenance} />
              </details>
            </section>
          );
        })}
        {unmapped.length ? (
          <details className={styles.provenance}>
            <summary>
              {t(
                "Records with unresolved passage mappings",
                "Einträge mit ungeklärter Passagenzuordnung",
              )}{" "}
              ({unmapped.length})
            </summary>
            <p>
              {t(
                "These records belong to the interval but cannot be assigned to an exact passage. Their original quotes and notes remain available.",
                "Diese Einträge gehören zum Zeitraum, können aber keiner genauen Passage zugeordnet werden. Ihre ursprünglichen Zitate und Notizen bleiben verfügbar.",
              )}
            </p>
            {unmapped.map(({ amendment, change }) => (
              <article key={amendment.id + ":" + change.id}>
                <h3>
                  <a
                    href={`${model.base}/amendments/${amendment.id}?return=${encodeURIComponent(href)}#change-${change.id}`}
                  >
                    {amendment.title}
                  </a>
                </h3>
                <p>{change.articleNumber}</p>
                <p>{amendment.comment}</p>
                <p>{change.note}</p>
              </article>
            ))}
          </details>
        ) : null}
        {!visible.length ? (
          <p>
            {t(
              "No passages match the current filters.",
              "Keine Passagen entsprechen den aktuellen Filtern.",
            )}
          </p>
        ) : null}
      </ConstitutionViewer>
    </FullWidthPage>
  );
}

type ComparisonColumnModel = {
  owner: string;
  from: VersionSummary;
  to: VersionSummary;
  fromId: string;
  toId: string;
  fromOutline?: ContentOutline;
  toOutline?: ContentOutline;
  fromReferences: ConstitutionCrossRefs;
  toReferences: ConstitutionCrossRefs;
  t: (en: string, de: string) => string;
};
function endpointPassageHref(
  passage: IndexedPassage | undefined,
  owner: string,
  versionId: string,
) {
  if (!passage) return undefined;
  const anchor = passage.article
    ? "unit-" + passage.article.id
    : (passage.entry?.node?.occurrenceId ?? passage.entry?.occurrenceId);
  return `${owner}/versions/${versionId}${anchor ? "#" + encodeURIComponent(anchor) : ""}`;
}
function comparisonColumn(
  side: "from" | "to",
  row: ConsolidatedPassage,
  left: ArticleSummary | undefined,
  right: ArticleSummary | undefined,
  model: ComparisonColumnModel,
  position: number,
) {
  const from = side === "from",
    passage = from ? row.before : row.after;
  const version = from ? model.from : model.to,
    versionId = from ? model.fromId : model.toId;
  const outline = from ? model.fromOutline : model.toOutline,
    oppositeOutline = from ? model.toOutline : model.fromOutline;
  const references = from ? model.fromReferences : model.toReferences;
  const href = endpointPassageHref(passage, model.owner, versionId);
  return (
    <section
      key={side}
      role="group"
      aria-label={`${version.versionLabel} · ${row.label} · ${position}`}
    >
      <p className={styles.eyebrow}>{version.versionLabel}</p>
      <p>{passage?.label}</p>
      {(from ? left : right) ? (
        <DocumentView scope="reader" controls={false}>
          <DiffConstitutionText
            left={left}
            right={right}
            side={side}
            outline={outline}
            oppositeOutline={oppositeOutline}
            showHeading={false}
            crossRefs={references}
            footnotes={references.footnotes}
          />
        </DocumentView>
      ) : (
        <p>{model.t("Not present", "Nicht vorhanden")}</p>
      )}
      {href ? (
        <p>
          <a href={href}>{model.t("Open passage", "Passage öffnen")} ↗</a>
        </p>
      ) : null}
    </section>
  );
}
