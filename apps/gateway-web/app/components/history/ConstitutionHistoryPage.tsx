import type { Amendment, VersionSummary } from "../../../lib/api";
import {
  historySnapshotAliases,
  historyPassageScope,
  matchesHistoryFilters,
  historyItemMarker,
  expandHistoryPassageScope,
} from "./history-page-state";
import { snapshotVersionId } from "../../../lib/reading";
import {
  historyHref,
  parseViewerLocation,
} from "../../../lib/constitution-viewer";
import {
  constitutionHistory,
  historyYearGroups,
  passageMatches,
} from "../../../lib/constitution-history";
import { ui, message } from "../../../lib/messages";
import { FormattedDate } from "../../../lib/format-date";
import { FullWidthPage } from "../layout/PageChrome";
import { ConstitutionViewer } from "./ConstitutionViewer";
import {
  ViewerUnavailable,
  loadViewer,
  type ViewerParams,
  type ViewerQuery,
  type ViewerModel,
} from "./load-viewer";
import { PassageChange } from "./PassageChange";
import { ReaderIcon } from "../ReaderIcon";
import { loadPassageWording } from "./passage-wording";
import styles from "./ConstitutionHistory.module.css";

export async function ConstitutionHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<ViewerParams>;
  searchParams: Promise<ViewerQuery>;
}) {
  const [values, query] = await Promise.all([params, searchParams]);
  const model = await loadViewer(values);
  if (!model) return <ViewerUnavailable params={values} />;
  return renderHistory(await historyPageState(model, query));
}

async function historyPageState(model: ViewerModel, query: ViewerQuery) {
  const { constitution, versions, amendments, events, owner, base, locale } =
    model;
  const aliases = await historySnapshotAliases(model, query);
  const viewed = parseViewerLocation(
    query.viewed,
    owner,
    constitution,
    amendments ?? [],
    (events ?? []).map((e) => e.id),
    aliases,
  );
  if (viewed?.kind === "event") {
    const event = events?.find((event) => event.id === viewed.id);
    if (event)
      viewed.label = message(locale, ui.lifecycleEvents[event.eventType]);
  }
  const knownSource = (id: string | undefined) =>
    Boolean(
      id &&
        (aliases[id] ||
          versions.some((v) => v.id === id || snapshotVersionId(v) === id)),
    );

  const t = (en: string, de: string) => (locale === "de" ? de : en);
  const scopeState = await historyPassageScope(query, knownSource);
  const { scope, scopeLabel } = scopeState;
  const ancestryUnavailable = query.passage
    ? await expandHistoryPassageScope(amendments ?? [], scope)
    : false;
  const scopeUnavailable = scopeState.scopeUnavailable || ancestryUnavailable;
  const items = constitutionHistory(
    owner,
    constitution.id,
    versions,
    amendments ?? [],
    events ?? [],
    scope,
  );
  let visible = items.filter((item) => matchesHistoryFilters(item, query));
  if (query.passage) {
    const changes = visible.flatMap(
      (item) =>
        item.amendment?.changes.filter((change) =>
          passageMatches(change, scope),
        ) ?? [],
    );
    const wording = new Map(
      (await loadPassageWording(changes, constitution.id)).map((change) => [
        change.id,
        change,
      ]),
    );
    visible = visible.map((item) =>
      item.amendment
        ? {
            ...item,
            amendment: {
              ...item.amendment,
              changes: item.amendment.changes.map(
                (change) => wording.get(change.id) ?? change,
              ),
            },
          }
        : item,
    );
  }
  const paramsString = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const currentHref = base + (paramsString.size ? "?" + paramsString : "");
  const filterHref = (kind: string) => {
    const next = new URLSearchParams(paramsString);
    if (kind) next.set("kind", kind);
    else next.delete("kind");
    return `${base}?${next}`;
  };
  const labels = {
    version: t("Legal version", "Rechtliche Fassung"),
    amendment: t("Amendment", "Änderung"),
    event: t("Lifecycle event", "Lebenszyklusereignis"),
    comparison: t("Comparison", "Vergleich"),
  };
  const navigation = (
    <nav
      className={`${styles.nav} ${styles.historyFilters}`}
      aria-label={t("History filters", "Geschichtsfilter")}
    >
      <p className={styles.eyebrow}>
        {t("In this constitution", "In dieser Verfassung")}
      </p>
      <h2>{t("History", "Geschichte")}</h2>
      {[
        ["", t("All events", "Alle Ereignisse")],
        ["amendment", t("Amendments", "Änderungen")],
        ["version", t("Legal versions", "Rechtliche Fassungen")],
        ["event", t("Lifecycle", "Lebenszyklus")],
      ].map(([kind, label]) => (
        <a
          key={kind}
          href={filterHref(kind)}
          aria-current={(query.kind ?? "") === kind ? "true" : undefined}
        >
          <ReaderIcon
            name={
              kind === "amendment"
                ? "edit"
                : kind === "version"
                  ? "book"
                  : "history"
            }
          />
          <span>{label}</span>
          <small>{items.filter((i) => !kind || i.kind === kind).length}</small>
        </a>
      ))}
      {model.latestHref ? (
        <a className={styles.readMore} href={model.latestHref}>
          <ReaderIcon name="book" />
          <span>{t("Read the constitution", "Verfassung lesen")} →</span>
        </a>
      ) : null}
    </nav>
  );
  const from =
      versions.find((v) => snapshotVersionId(v) === query.compareFrom) ??
      versions[0],
    to =
      versions.find((v) => snapshotVersionId(v) === query.compareTo) ??
      versions.at(-1);
  const source =
    query.sourceVersion && knownSource(query.sourceVersion)
      ? `${owner}/versions/${query.sourceVersion}#unit-${encodeURIComponent(query.sourceAnchor ?? query.passage ?? "")}`
      : undefined;
  return {
    model,
    query,
    constitution,
    versions,
    amendments,
    events,
    owner,
    base,
    locale,
    aliases,
    viewed,
    t,
    scope,
    scopeLabel,
    scopeUnavailable,
    items,
    visible,
    currentHref,
    labels,
    navigation,
    from,
    to,
    source,
  };
}
type HistoryState = Awaited<ReturnType<typeof historyPageState>>;

function renderHistory(state: HistoryState) {
  const {
    model,
    query,
    viewed,
    base,
    navigation,
    amendments,
    events,
    scopeUnavailable,
    t,
  } = state;
  return (
    <FullWidthPage template="reader">
      <ConstitutionViewer
        breadcrumbs={model.breadcrumbs}
        mode="history"
        initialPanel={query.view === "wiki" ? "wiki" : undefined}
        readHref={viewed?.href ?? model.latestHref}
        historyHref={base}
        wiki={model.wiki}
        details={model.details}
        navigation={navigation}
      >
        {historyHeading(state)}
        {historyControls(state)}
        {amendments === null || events === null || scopeUnavailable ? (
          <p role="status">
            {t(
              "Some history could not be loaded. Reload to try again.",
              "Ein Teil der Geschichte konnte nicht geladen werden. Laden Sie die Seite erneut.",
            )}
          </p>
        ) : null}
        {historyEvents(state)}
      </ConstitutionViewer>
    </FullWidthPage>
  );
}
function historyHeading({
  constitution,
  query,
  t,
  scopeLabel,
  source,
  viewed,
  labels,
}: HistoryState) {
  return (
    <>
      <p className={styles.eyebrow}>{constitution.title}</p>
      <h1>
        {query.passage
          ? t("History of this passage", "Geschichte dieser Passage")
          : t("A constitution, over time.", "Eine Verfassung im Wandel.")}
      </h1>
      <p className={styles.lede}>
        {query.passage
          ? scopeLabel
          : t(
              "Follow its legal versions, the amendments between them, and the moments that shaped it.",
              "Entdecken Sie rechtliche Fassungen, die Änderungen dazwischen und prägende Ereignisse.",
            )}
      </p>
      {source ? (
        <p>
          <a href={source}>← {t("Back to viewer", "Zurück zur Ansicht")}</a>
        </p>
      ) : null}
      {viewed ? (
        <div className={styles.context}>
          <div>
            <p className={styles.eyebrow}>
              {t("Last viewed", "Zuletzt angesehen")} · {labels[viewed.kind]}
            </p>
            <strong>{viewed.label}</strong>
          </div>
          <a href={viewed.href}>
            ← {t("Back to", "Zurück zu")}{" "}
            {viewed.kind === "comparison" ? labels.comparison : viewed.label}
          </a>
        </div>
      ) : null}
    </>
  );
}

function historyControls({
  query,
  t,
  versions,
  amendments,
  model,
  from,
  to,
  viewed,
  owner,
  constitution,
  base,
  items,
  visible,
}: HistoryState) {
  return (
    <>
      {!query.passage ? (
        <div className={styles.stats}>
          <div>
            <strong>
              {versions[0]?.effectiveDate?.slice(0, 4) ?? "…"}—
              {versions.at(-1)?.effectiveDate?.slice(0, 4) ?? "…"}
            </strong>
            <small>{t("Legal history", "Rechtsgeschichte")}</small>
          </div>
          <div>
            <strong>{amendments?.length ?? "—"}</strong>
            <small>{t("Amendments", "Änderungen")}</small>
          </div>
          <div>
            <strong>{versions.length}</strong>
            <small>
              {t("Published versions", "Veröffentlichte Fassungen")}
            </small>
          </div>
          {model.latestHref ? (
            <a href={model.latestHref}>
              {t("Read latest text", "Neuesten Text lesen")} →
            </a>
          ) : null}
        </div>
      ) : null}
      {versions.length > 1 ? (
        <details className={styles.picker}>
          <summary>
            <strong>
              {t("Compare legal versions", "Rechtliche Fassungen vergleichen")}
            </strong>
            <span>
              {from?.versionLabel} → {to?.versionLabel}
            </span>
            {viewed?.kind === "comparison" ? (
              <small className={styles.reading}>
                {t("Last viewed", "Zuletzt angesehen")}
              </small>
            ) : null}
          </summary>
          <p>
            {t(
              "See the combined result of the amendments between two versions.",
              "Sehen Sie das zusammengefasste Ergebnis aller Änderungen zwischen zwei Fassungen.",
            )}
          </p>
          <form action={`${owner}/compare`}>
            <div className={styles.range}>
              <label>
                {t("Starting version", "Ausgangsfassung")}
                <select
                  name="from"
                  defaultValue={from ? snapshotVersionId(from) : ""}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={snapshotVersionId(v)}>
                      {v.versionLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Ending version", "Zielfassung")}
                <select
                  name="to"
                  defaultValue={to ? snapshotVersionId(to) : ""}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={snapshotVersionId(v)}>
                      {v.versionLabel}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input
              type="hidden"
              name="return"
              value={historyHref(
                owner,
                constitution.id,
                viewed ?? undefined,
                query.passage
                  ? {
                      passage: query.passage,
                      sourceVersion: query.sourceVersion ?? "",
                      sourceAnchor: query.sourceAnchor ?? "",
                    }
                  : undefined,
              )}
            />
            {query.passage ? (
              <input type="hidden" name="passage" value={query.passage} />
            ) : null}
            <p>
              <button type="submit">
                {t("Compare versions", "Fassungen vergleichen")} →
              </button>
            </p>
          </form>
        </details>
      ) : null}
      {query.passage &&
      (amendments ?? []).some((a) =>
        a.changes.some(
          (c) => !c.beforeRef?.logicalId && !c.afterRef?.logicalId,
        ),
      ) ? (
        <p role="status">
          {t(
            "Some legacy amendment records have no exact passage mapping and are excluded from this passage filter.",
            "Einige ältere Änderungseinträge besitzen keine genaue Passagenzuordnung und werden in diesem Passagenfilter nicht angezeigt.",
          )}{" "}
          <a href={base + "?kind=amendment"}>
            {t("View all amendments", "Alle Änderungen ansehen")}
          </a>
        </p>
      ) : null}
      <form className={styles.filters} action={base}>
        {Object.entries(query)
          .filter(([key, value]) => value && !["q", "year"].includes(key))
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <input
          name="q"
          type="search"
          defaultValue={query.q}
          aria-label={t(
            "Find an amendment, article or event",
            "Änderung, Artikel oder Ereignis suchen",
          )}
          placeholder={t(
            "Find an amendment, article or event…",
            "Änderung, Artikel oder Ereignis suchen…",
          )}
        />
        <select
          name="year"
          defaultValue={query.year ?? ""}
          aria-label={t("Period", "Zeitraum")}
        >
          <option value="">{t("All years", "Alle Jahre")}</option>
          {[
            ...new Set(items.map((i) => i.date.slice(0, 4)).filter(Boolean)),
          ].map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
        <button>{t("Filter", "Filtern")}</button>
        <small>
          {visible.length} {t("events", "Ereignisse")}
        </small>
      </form>
    </>
  );
}

function historyEvents(state: HistoryState) {
  const { visible, t } = state;
  return (
    <>
      <div className={styles.timeline}>
        {historyYearGroups(visible).map((group) => (
          <section
            className={styles.yearGroup}
            key={group.year}
            aria-labelledby={"history-year-" + (group.year || "unknown")}
          >
            <div className={styles.yearMarker}>
              <h2 id={"history-year-" + (group.year || "unknown")}>
                {group.year || t("Undated", "Ohne Datum")}
              </h2>
              <span aria-hidden="true" />
            </div>
            <div className={styles.yearEvents}>
              {group.events.map((item) => historyEvent(item, state))}
            </div>
          </section>
        ))}
      </div>
      {!visible.length ? (
        <p>
          {t(
            "No published events match these filters.",
            "Keine veröffentlichten Ereignisse entsprechen diesen Filtern.",
          )}
        </p>
      ) : null}
    </>
  );
}

function historyEvent(
  item: HistoryState["items"][number],
  {
    viewed,
    aliases,
    t,
    labels,
    locale,
    query,
    scope,
    owner,
    versions,
    currentHref,
  }: HistoryState,
) {
  const marker = historyItemMarker(viewed, item, aliases);
  return (
    <article
      className={styles.event}
      data-kind={item.kind}
      key={`${item.kind}-${item.id}`}
      aria-current={marker.isCurrent ? "true" : undefined}
    >
      <div className={styles.meta}>
        <span className={styles.badge}>
          <ReaderIcon
            name={
              item.kind === "version"
                ? "book"
                : item.kind === "amendment"
                  ? "edit"
                  : "history"
            }
          />{" "}
          {labels[item.kind]}
        </span>
        <FormattedDate value={item.date} />
        {marker.isCurrent ? (
          <span className={styles.reading}>
            {t("Last viewed", "Zuletzt angesehen")}
          </span>
        ) : null}
        {marker.endpoint ? (
          <span className={styles.reading}>
            {marker.endpoint === "start"
              ? t("Comparison start", "Vergleichsbeginn")
              : t("Comparison end", "Vergleichsende")}
          </span>
        ) : null}
        {item.version?.latestPublished ? (
          <small>{t("Latest", "Neueste Fassung")}</small>
        ) : null}
      </div>
      <h3>
        {item.kind === "event" ? (
          message(
            locale,
            ui.lifecycleEvents[item.title as keyof typeof ui.lifecycleEvents],
          )
        ) : item.kind === "version" ? (
          <>
            {t("Constitution text", "Verfassungstext")} · {item.title}
          </>
        ) : (
          item.title
        )}
      </h3>
      {item.summary ? <p>{item.summary}</p> : null}
      {query.passage && item.amendment
        ? item.amendment.changes
            .filter((c) => passageMatches(c, scope))
            .map((change) => (
              <PassageChange key={change.id} change={change} compact />
            ))
        : null}
      {amendmentVersionLinks(item.amendment, owner, t, versions)}
      <div className={styles.action}>
        <a
          href={`${item.href}${item.kind !== "version" ? "?return=" + encodeURIComponent(currentHref) : ""}`}
        >
          {item.kind === "version"
            ? t("Read this version", "Diese Fassung lesen")
            : item.kind === "amendment"
              ? t("Explore amendment", "Änderung ansehen")
              : t("View event", "Ereignis ansehen")}{" "}
          →
        </a>
      </div>
    </article>
  );
}

function amendmentVersionLinks(
  amendment: Amendment | undefined,
  owner: string,
  t: HistoryState["t"],
  versions: VersionSummary[],
) {
  const source = amendment?.sourceVersionId,
    target = amendment?.targetVersionId;
  if (!source && !target) return null;
  const label = (id: string) =>
    versions.find((version) =>
      [version.id, version.legalVersionId, snapshotVersionId(version)].includes(
        id,
      ),
    )?.versionLabel;
  return (
    <p className={styles.versionLinks}>
      {source ? (
        <a href={`${owner}/versions/${source}`}>
          {label(source) ?? t("Before text", "Vorheriger Text")}
        </a>
      ) : null}
      {source && target ? " → " : null}
      {target ? (
        <a href={`${owner}/versions/${target}`}>
          {label(target) ?? t("After text", "Nachfolgender Text")}
        </a>
      ) : null}
    </p>
  );
}
