import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  TranslationProvider,
  useTranslation,
} from "../../../../apps/gateway-web/app/components/TranslationProvider";
import { SiteHeader } from "../../../../apps/gateway-web/app/components/SiteHeader";
import {
  ReaderIcon,
  type ReaderIconName,
} from "../../../../apps/gateway-web/app/components/ReaderIcon";
import {
  FullWidthPage,
  PageChromeSurface,
  PageContentsBody,
  PageContentsLayout,
  PageMenuBar,
  PageMenuDivider,
  PageMenuFrame,
} from "../../../../apps/gateway-web/app/components/layout/PageChrome";
import { usePageChromeMetrics } from "../../../../apps/gateway-web/app/components/layout/usePageChromeMetrics";
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  TextArea,
} from "../../../../apps/gateway-web/app/components/ui";
import {
  Inline,
  Stack,
} from "../../../../apps/gateway-web/app/components/layout/Layout";
import {
  OutlineLayerEditor,
  type LayerSection,
} from "../../../../apps/gateway-web/app/admin/constitutions/OutlineLayerEditor";
import { StructurePreview } from "../../../../apps/gateway-web/app/admin/constitutions/StructureWorkspaceTemplate";
import {
  explicitLayers,
  outlineBranches,
  updateOutlineLayers,
  type OutlineBranch,
} from "../../../../apps/gateway-web/app/admin/constitutions/outline-editor-model";
import { OutlineReaderPreview } from "../../../../apps/gateway-web/app/admin/constitutions/OutlineReaderPreview";
import { setupOutline } from "../../../../apps/gateway-web/lib/setup-review";
import { structureUi } from "../../../../apps/gateway-web/lib/structure-workspace";
import type { DocumentRecord } from "../../../../apps/gateway-web/lib/document-api";
import { Evidence } from "./Evidence";
import { kinds, sampleRoots, title } from "./sample";
import "../../../../apps/gateway-web/app/styles/tokens.css";
import "../../../../apps/gateway-web/app/globals.css";
import styles from "./preview.module.css";

type View = "proposal" | "structure" | "documents" | "review" | "history";
type State =
  | "proposed"
  | "requested"
  | "confirming"
  | "confirmed"
  | "withdrawn";
const views: { id: View; en: string; de: string; icon: ReaderIconName }[] = [
  { id: "proposal", en: "Proposal", de: "Vorschlag", icon: "details" },
  { id: "structure", en: "Structure", de: "Struktur", icon: "settings" },
  { id: "documents", en: "Documents", de: "Dokumente", icon: "link" },
  { id: "review", en: "Review", de: "Prüfung", icon: "check" },
  { id: "history", en: "History", de: "Verlauf", icon: "history" },
];

function Preview() {
  const [locale, setLocale] = useState<"de" | "en">(
    new URLSearchParams(location.search).get("lang") === "en" ? "en" : "de",
  );
  const [state, setState] = useState<State>("proposed");
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const copy = (en: string, de: string) => (locale === "en" ? en : de);
  return (
    <TranslationProvider locale={locale}>
      <div className={styles.demo}>
        <span>
          {copy(
            "Interactive design mock · Sample data",
            "Interaktiver Entwurf · Beispieldaten",
          )}
        </span>
        <div>
          <label className={styles.statePicker}>
            {copy("Example state", "Beispielzustand")}
            <select
              value={state}
              onChange={(event) => setState(event.target.value as State)}
            >
              <option value="proposed">
                {copy("Ready for review", "Bereit zur Prüfung")}
              </option>
              <option value="requested">
                {copy("Changes requested", "Änderungen angefordert")}
              </option>
              <option value="confirming">
                {copy("Confirmation interrupted", "Bestätigung unterbrochen")}
              </option>
              <option value="confirmed">
                {copy("Confirmed", "Bestätigt")}
              </option>
              <option value="withdrawn">
                {copy("Withdrawn", "Zurückgezogen")}
              </option>
            </select>
          </label>
          <label className={styles.language}>
            <span className="visually-hidden">
              {copy("Preview language", "Vorschausprache")}
            </span>
            <select
              value={locale}
              onChange={(event) => {
                const next = event.target.value as "de" | "en";
                setLocale(next);
                document.documentElement.lang = next;
              }}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="button" onClick={() => location.reload()}>
            {copy("Reset", "Zurücksetzen")}
          </button>
        </div>
      </div>
      <Workspace state={state} setState={setState} />
    </TranslationProvider>
  );
}

function Workspace({
  state,
  setState,
}: {
  state: State;
  setState: (value: State) => void;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const [view, setView] = useState<View>("proposal"),
    [expanded, setExpanded] = useState(() => innerWidth > 680);
  const [layers, setLayers] = useState(() => explicitLayers(kinds, true)),
    [selected, setSelected] = useState(1),
    [section, setSection] = useState<LayerSection>("display");
  const [reason, setReason] = useState(""),
    [recordedReason, setRecordedReason] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState(false);
  const [inspected, setInspected] = useState<DocumentRecord | null>(null),
    [outside, setOutside] = useState("");
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    navigation = useRef<HTMLElement>(null),
    withdrawal = useRef<HTMLDialogElement>(null);
  usePageChromeMetrics(root, menu, navigation);
  const editable = state === "proposed" || state === "requested";
  const label =
    state === "confirmed"
      ? copy("Confirmed", "Bestätigt")
      : state === "confirming"
        ? copy("Confirmation interrupted", "Bestätigung unterbrochen")
        : state === "requested"
          ? copy("Changes requested", "Änderungen angefordert")
          : state === "withdrawn"
            ? copy("Withdrawn", "Zurückgezogen")
            : copy("Ready for review", "Bereit zur Prüfung");
  const statusTone =
    state === "confirmed"
      ? "added"
      : state === "requested" || state === "confirming"
        ? "changed"
        : "info";
  function choose(next: View) {
    setView(next);
    setNotice("");
  }
  function requestChanges() {
    choose("review");
    requestAnimationFrame(() => {
      const field = document.getElementById("requested-changes");
      field?.closest("details")?.setAttribute("open", "");
      field?.focus();
    });
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? views.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : views.length - 1)) %
            views.length;
    choose(views[next].id);
    document.getElementById(`setup-tab-${views[next].id}`)?.focus();
  }
  function hierarchy(branches: OutlineBranch[]): ReactNode {
    return (
      <ul className={styles.tree}>
        {branches.map((branch) => (
          <li key={branch.path}>
            <button
              type="button"
              aria-current={selected === branch.index ? "true" : undefined}
              onClick={() => {
                setSelected(branch.index);
                choose("structure");
              }}
            >
              <span>{layers[branch.index].displayLabel}</span>
              <small>
                {copy(
                  branch.children.length
                    ? "Contains child units"
                    : "Contains text",
                  branch.children.length
                    ? "Enthält Untereinheiten"
                    : "Enthält Text",
                )}
              </small>
            </button>
            {branch.children.length ? hierarchy(branch.children) : null}
          </li>
        ))}
      </ul>
    );
  }
  const actions = (
    <Inline>
      <Badge tone={statusTone}>{label}</Badge>
      <span className={styles.revision}>{copy("Revision", "Revision")} 2</span>
    </Inline>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        {copy("Skip to main content", "Zum Hauptinhalt springen")}
      </a>
      <div
        className={styles.shell}
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (link) {
            event.preventDefault();
            setOutside(link.textContent?.trim() || "");
          }
        }}
        onSubmitCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOutside(copy("Search", "Suche"));
        }}
      >
        <SiteHeader
          user={{ email: "editor@example.test", roles: ["editor"] }}
        />
      </div>
      <FullWidthPage template="workspace">
        <PageChromeSurface ref={root} className={styles.surface}>
          <div className={styles.header}>
            <PageHeader
              separator={false}
              title={copy(
                "Review constitution setup",
                "Verfassungseinrichtung prüfen",
              )}
              breadcrumbs={[
                { href: "#proposal", label: copy("Imports", "Importe") },
                { label: copy("Constitution setup", "Verfassungseinrichtung") },
              ]}
              meta={copy(
                "Check the proposed identity and structure before creating the constitution.",
                "Prüfen Sie Identität und Aufbau, bevor die Verfassung angelegt wird.",
              )}
            />
          </div>
          <PageMenuFrame ref={menu}>
            <PageMenuBar
              compact
              label={copy("Constitution setup", "Verfassungseinrichtung")}
              role="toolbar"
            >
              <button
                type="button"
                className={styles.tool}
                title={copy(
                  expanded ? "Hide overview" : "Show overview",
                  expanded ? "Übersicht ausblenden" : "Übersicht einblenden",
                )}
                aria-label={copy(
                  expanded ? "Hide overview" : "Show overview",
                  expanded ? "Übersicht ausblenden" : "Übersicht einblenden",
                )}
                aria-expanded={expanded}
                aria-controls="setup-contents"
                onClick={() => setExpanded(!expanded)}
              >
                <ReaderIcon name="contents" />
                <span className={styles.toolLabel}>
                  {copy("Overview", "Übersicht")}
                </span>
              </button>
              <PageMenuDivider />
              <div
                className={styles.tabs}
                role="tablist"
                aria-label={copy(
                  "Constitution setup views",
                  "Ansichten der Verfassungseinrichtung",
                )}
              >
                {views.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`setup-tab-${tab.id}`}
                    aria-controls={`setup-panel-${tab.id}`}
                    aria-label={copy(tab.en, tab.de)}
                    title={copy(tab.en, tab.de)}
                    aria-selected={view === tab.id}
                    tabIndex={view === tab.id ? 0 : -1}
                    className={styles.tool}
                    onClick={() => choose(tab.id)}
                    onKeyDown={(event) => keyboard(event, index)}
                  >
                    <ReaderIcon name={tab.icon} />
                    <span className={styles.toolLabel}>
                      {copy(tab.en, tab.de)}
                    </span>
                  </button>
                ))}
              </div>
            </PageMenuBar>
          </PageMenuFrame>
          <PageContentsLayout
            navigationId="setup-contents"
            navigationRef={navigation}
            expanded={expanded}
            navigation={
              <nav
                aria-label={copy("Proposal overview", "Vorschlagsübersicht")}
                className={styles.contents}
              >
                <p className={styles.eyebrow}>
                  {copy("This proposal", "Dieser Vorschlag")}
                </p>
                <div className={styles.owner}>
                  <span>DE</span>
                  <div>
                    {copy("Germany", "Deutschland")}
                    <small>
                      {copy(
                        "National constitution · German",
                        "Nationale Verfassung · Deutsch",
                      )}
                    </small>
                  </div>
                </div>

                <div className={styles.division}>
                  <p className={styles.eyebrow}>
                    {copy("Proposed hierarchy", "Vorgeschlagene Gliederung")}
                  </p>
                  {hierarchy(outlineBranches(layers))}
                </div>
                <p className={styles.sidebarNote}>
                  {copy(
                    "Proposal revision 2. Nothing has been published.",
                    "Vorschlag in Revision 2. Noch nichts veröffentlicht.",
                  )}
                </p>
              </nav>
            }
          >
            <PageContentsBody className={styles.body}>
              <div className={styles.selectedHeader}>
                <div>
                  {actions}
                  <h2>{title}</h2>
                </div>
                {view !== "review" &&
                !["confirmed", "withdrawn"].includes(state) ? (
                  <Button type="button" onClick={() => choose("review")}>
                    {copy("Review and confirm", "Zur Bestätigung")}
                    <ReaderIcon name="right" />
                  </Button>
                ) : null}
              </div>
              {notice ? (
                <p role="status" className={styles.notice}>
                  <ReaderIcon name="check" />
                  {notice}
                </p>
              ) : null}
              {state === "requested" ? (
                <Alert tone="info">
                  {recordedReason ||
                    copy(
                      "Please verify the source reference before confirming the proposal.",
                      "Bitte prüfen Sie die Quellenangabe, bevor Sie den Vorschlag bestätigen.",
                    )}{" "}
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      setState("proposed");
                      setNotice(
                        copy(
                          "A revised example proposal has been loaded.",
                          "Ein überarbeiteter Beispielvorschlag wurde geladen.",
                        ),
                      );
                    }}
                  >
                    {copy(
                      "Load revised example",
                      "Überarbeitetes Beispiel laden",
                    )}
                  </button>
                </Alert>
              ) : null}
              {state === "confirmed" ? (
                <Alert tone="success">
                  {copy(
                    "Constitution and structure created. Importing and publishing wording remain separate steps.",
                    "Verfassung und Struktur sind angelegt. Textimport und Veröffentlichung bleiben eigene Schritte.",
                  )}
                </Alert>
              ) : null}
              {state === "confirming" ? (
                <Alert tone="info">
                  {copy(
                    "Confirmation was interrupted. Resume the existing operation without creating a second constitution.",
                    "Die Bestätigung wurde unterbrochen. Setzen Sie den bestehenden Vorgang fort, ohne eine zweite Verfassung anzulegen.",
                  )}
                </Alert>
              ) : null}
              {state === "withdrawn" ? (
                <Alert tone="info">
                  {copy(
                    "This proposal was withdrawn. Its details and history remain available.",
                    "Dieser Vorschlag wurde zurückgezogen. Angaben und Verlauf bleiben einsehbar.",
                  )}
                </Alert>
              ) : null}
              <section
                id="setup-panel-proposal"
                role="tabpanel"
                aria-labelledby="setup-tab-proposal"
                hidden={view !== "proposal"}
              >
                <Stack gap="section">
                  <div className={styles.changeStrip}>
                    <ReaderIcon name="history" />
                    <p>
                      {copy("Revised proposal", "Überarbeiteter Vorschlag")}
                      <small>
                        {copy(
                          "Source reference added · Paragraph display adjusted",
                          "Quellenangabe ergänzt · Absatzdarstellung angepasst",
                        )}
                      </small>
                    </p>
                    <button type="button" onClick={() => choose("history")}>
                      {copy("View changes", "Änderungen ansehen")}
                      <ReaderIcon name="right" />
                    </button>
                  </div>
                  <div className={styles.summaryGrid}>
                    <section>
                      <h3>
                        {copy(
                          "Identity and ownership",
                          "Identität und Zuordnung",
                        )}
                      </h3>
                      <dl className={styles.facts}>
                        <div>
                          <dt>{copy("Country", "Land")}</dt>
                          <dd>{copy("Germany", "Deutschland")} · DE</dd>
                        </div>
                        <div>
                          <dt>{copy("Constitution", "Verfassung")}</dt>
                          <dd>{title}</dd>
                        </div>
                        <div>
                          <dt>{copy("Language", "Sprache")}</dt>
                          <dd>Deutsch · de</dd>
                        </div>
                        <div>
                          <dt>{copy("Scope", "Zuordnung")}</dt>
                          <dd>
                            {copy(
                              "National · No predecessor specified",
                              "National · Kein Vorgänger angegeben",
                            )}
                          </dd>
                        </div>
                      </dl>
                      <details className={styles.secondary}>
                        <summary>
                          {copy("Technical identifier", "Technische Kennung")}
                        </summary>
                        <code>grundgesetz</code>
                      </details>
                    </section>
                    <section>
                      <h3>
                        {copy(
                          "Source of the proposal",
                          "Quelle des Vorschlags",
                        )}
                      </h3>
                      <p className={styles.sourceTitle}>
                        Bundesgesetzblatt 1949, S. 1
                      </p>
                      <p className={styles.muted}>
                        {copy(
                          "Basic Law, promulgated on 23 May 1949. The sample below is a text excerpt.",
                          "Grundgesetz, verkündet am 23. Mai 1949. Das folgende Lesebeispiel ist ein Textauszug.",
                        )}
                      </p>
                      <a
                        className={styles.sourceLink}
                        href="https://www.gesetze-im-internet.de/gg/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        gesetze-im-internet.de/gg
                        <ReaderIcon name="external" />
                      </a>
                      <p className={styles.muted}>
                        {copy(
                          "Supplementary documents are kept separately from these proposed source details.",
                          "Ergänzende Dokumente werden getrennt von diesen vorgeschlagenen Quellenangaben geführt.",
                        )}
                      </p>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => choose("documents")}
                      >
                        {copy(
                          "View supplementary evidence",
                          "Ergänzende Belege ansehen",
                        )}
                        <ReaderIcon name="right" />
                      </button>
                    </section>
                  </div>
                  <section>
                    <div className={styles.sectionHeading}>
                      <div>
                        <h3>
                          {copy("Proposed structure", "Vorgeschlagener Aufbau")}
                        </h3>
                        <p className={styles.muted}>
                          {copy(
                            "Three levels, with a reading example from the proposal.",
                            "Drei Ebenen mit einem Lesebeispiel aus dem Vorschlag.",
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => choose("structure")}
                      >
                        {copy("Inspect structure", "Struktur prüfen")}
                        <ReaderIcon name="right" />
                      </Button>
                    </div>
                    <div className={styles.hierarchyStrip}>
                      {layers.map((layer, index) => (
                        <span key={layer.kindCode}>
                          {index ? <ReaderIcon name="right" /> : null}
                          {layer.displayLabel}
                        </span>
                      ))}
                    </div>
                    <div className={styles.excerpt}>
                      <OutlineReaderPreview
                        roots={sampleRoots}
                        outline={setupOutline(layers)}
                      />
                    </div>
                  </section>
                </Stack>
              </section>
              <section
                id="setup-panel-structure"
                role="tabpanel"
                aria-labelledby="setup-tab-structure"
                hidden={view !== "structure"}
              >
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>
                      {copy(
                        "Structure and display",
                        "Struktur und Darstellung",
                      )}
                    </h3>
                    <p className={styles.muted}>
                      {copy(
                        "Display changes appear immediately in the reading preview.",
                        "Änderungen an der Darstellung erscheinen sofort in der Lesefassung.",
                      )}
                    </p>
                  </div>
                </div>
                <div className={styles.structureGrid}>
                  <section
                    className={styles.levelEditor}
                    aria-label={copy("Selected level", "Ausgewählte Ebene")}
                  >
                    <header>
                      <span className={styles.eyebrow}>
                        {copy("Selected level", "Ausgewählte Ebene")}
                      </span>
                      <h3>{layers[selected].displayLabel}</h3>
                    </header>
                    <div
                      className={styles.innerTabs}
                      role="group"
                      aria-label={copy(
                        "Level settings",
                        "Einstellungen der Ebene",
                      )}
                    >
                      {(
                        ["display", "structure", "editing"] as LayerSection[]
                      ).map((tab) => (
                        <button
                          type="button"
                          key={tab}
                          aria-pressed={section === tab}
                          onClick={() => setSection(tab)}
                        >
                          {t(structureUi[tab])}
                        </button>
                      ))}
                    </div>
                    <div className={styles.levelFields}>
                      <OutlineLayerEditor
                        layer={layers[selected]}
                        index={selected}
                        layers={layers}
                        section={section}
                        structural={false}
                        display={editable}
                        update={(index, patch) => {
                          setLayers((current) =>
                            updateOutlineLayers(current, index, patch),
                          );
                          setSaved(false);
                        }}
                      />
                      {section !== "display" ? (
                        <p className={styles.muted}>
                          {copy(
                            "The proposed structure is fixed here. Request changes if its hierarchy or editing rules need correction.",
                            "Der vorgeschlagene Aufbau bleibt hier fest. Fordern Sie Änderungen an, wenn Gliederung oder Eingaberegeln korrigiert werden müssen.",
                          )}
                        </p>
                      ) : null}
                    </div>
                  </section>
                  <StructurePreview layers={layers} sampleRoots={sampleRoots} />
                </div>
                <Inline className={styles.saveRow}>
                  {editable ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setSaved(true);
                        setNotice(
                          copy(
                            "Display settings saved in this mock.",
                            "Darstellung in diesem Entwurf gespeichert.",
                          ),
                        );
                      }}
                    >
                      {copy("Save display", "Darstellung speichern")}
                    </Button>
                  ) : null}
                  <span className={styles.muted}>
                    {saved
                      ? copy("Saved", "Gespeichert")
                      : copy(
                          "Authored wording and the hierarchy remain unchanged.",
                          "Wortlaut und Gliederung bleiben unverändert.",
                        )}
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={requestChanges}
                    >
                      {copy(
                        "Request structural changes",
                        "Strukturänderung anfordern",
                      )}
                      <ReaderIcon name="right" />
                    </button>
                  ) : null}
                </Inline>
              </section>
              <section
                id="setup-panel-documents"
                role="tabpanel"
                aria-labelledby="setup-tab-documents"
                hidden={view !== "documents"}
              >
                <Stack gap="card">
                  <p className={styles.muted}>
                    {copy(
                      "Evidence for this setup proposal. Each attachment keeps its cited revision and its own contextual note.",
                      "Belege zu diesem Einrichtungsvorschlag. Jede Verknüpfung behält ihre zitierte Revision und eine eigene Kontextnotiz.",
                    )}
                  </p>
                  <Evidence onInspect={setInspected} />
                </Stack>
              </section>
              <section
                id="setup-panel-review"
                role="tabpanel"
                aria-labelledby="setup-tab-review"
                hidden={view !== "review"}
              >
                <Stack gap="card">
                  <div>
                    <h3>{copy("Before confirming", "Vor der Bestätigung")}</h3>
                    <p className={styles.muted}>
                      {copy(
                        "Check the proposal as a whole. Confirming creates the constitution and its proposed structure.",
                        "Prüfen Sie den Vorschlag als Ganzes. Die Bestätigung legt die Verfassung mit dem vorgeschlagenen Aufbau an.",
                      )}
                    </p>
                  </div>
                  <ol className={styles.checklist}>
                    {[
                      {
                        en: "Identity and source",
                        de: "Identität und Quelle",
                        detail: copy(
                          "Germany · German · Federal Law Gazette 1949",
                          "Deutschland · Deutsch · Bundesgesetzblatt 1949",
                        ),
                        target: "proposal",
                      },
                      {
                        en: "Structure and reading example",
                        de: "Struktur und Lesebeispiel",
                        detail: layers
                          .map((layer) => layer.displayLabel)
                          .join(" → "),
                        target: "structure",
                      },
                      {
                        en: "Evidence and changes",
                        de: "Belege und Änderungen",
                        detail: copy(
                          "Pinned document revisions and the changes in revision 2.",
                          "Fest zitierte Dokumentrevisionen und die Änderungen in Revision 2.",
                        ),
                        target: "documents",
                      },
                    ].map((entry, index) => (
                      <li key={entry.target}>
                        <span>{index + 1}</span>
                        <div>
                          <h4>{copy(entry.en, entry.de)}</h4>
                          <p>{entry.detail}</p>
                        </div>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => choose(entry.target as View)}
                        >
                          {copy("Inspect", "Ansehen")}
                          <ReaderIcon name="right" />
                        </button>
                      </li>
                    ))}
                  </ol>
                  {!["confirmed", "withdrawn"].includes(state) ? (
                    <Card>
                      <h3>{copy("Confirm setup", "Einrichtung bestätigen")}</h3>
                      <p className={styles.muted}>
                        {copy(
                          "This step does not publish constitutional wording. Import review and publication follow separately.",
                          "Dieser Schritt veröffentlicht keinen Verfassungstext. Importprüfung und Veröffentlichung folgen gesondert.",
                        )}
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={state === "requested"}
                        onClick={() => {
                          setState("confirmed");
                          setSaved(true);
                        }}
                      >
                        {copy(
                          state === "confirming"
                            ? "Resume confirmation"
                            : "Confirm setup",
                          state === "confirming"
                            ? "Bestätigung fortsetzen"
                            : "Einrichtung bestätigen",
                        )}
                        <ReaderIcon name="check" />
                      </Button>
                      {state === "requested" ? (
                        <p className={styles.muted}>
                          {copy(
                            "A revised proposal is required before confirmation.",
                            "Vor der Bestätigung ist ein überarbeiteter Vorschlag erforderlich.",
                          )}
                        </p>
                      ) : null}
                    </Card>
                  ) : null}
                  {editable ? (
                    <details className={styles.feedback}>
                      <summary>
                        {copy(
                          "Something needs correcting?",
                          "Etwas muss korrigiert werden?",
                        )}
                      </summary>
                      <Stack>
                        <TextArea
                          id="requested-changes"
                          label={copy(
                            "Requested changes",
                            "Gewünschte Änderungen",
                          )}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          rows={4}
                          maxLength={4000}
                          help={copy(
                            "Describe the correction separately from the proposed content. At least 10 characters.",
                            "Beschreiben Sie die Korrektur getrennt vom vorgeschlagenen Inhalt. Mindestens 10 Zeichen.",
                          )}
                        />
                        <Button
                          type="button"
                          disabled={reason.trim().length < 10}
                          onClick={() => {
                            setRecordedReason(reason);
                            setState("requested");
                            setNotice(
                              copy(
                                "Changes requested in this mock. Your note has been retained.",
                                "Änderungen in diesem Entwurf angefordert. Ihre Notiz bleibt erhalten.",
                              ),
                            );
                          }}
                        >
                          {copy("Request changes", "Änderungen anfordern")}
                        </Button>
                      </Stack>
                    </details>
                  ) : null}
                  {editable ? (
                    <div className={styles.withdraw}>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => withdrawal.current?.showModal()}
                      >
                        {copy("Withdraw proposal", "Vorschlag zurückziehen")}
                      </button>
                      <span className={styles.muted}>
                        {copy(
                          "Use this if the proposal should not be processed.",
                          "Wenn dieser Vorschlag nicht weiter bearbeitet werden soll.",
                        )}
                      </span>
                    </div>
                  ) : null}
                </Stack>
              </section>
              <section
                id="setup-panel-history"
                role="tabpanel"
                aria-labelledby="setup-tab-history"
                hidden={view !== "history"}
              >
                <Stack gap="card">
                  <div>
                    <h3>
                      {copy("Proposal history", "Verlauf des Vorschlags")}
                    </h3>
                    <p className={styles.muted}>
                      {copy(
                        "Changes to the proposal remain separate from constitutional text history.",
                        "Änderungen am Vorschlag bleiben von der Textgeschichte der Verfassung getrennt.",
                      )}
                    </p>
                  </div>
                  <ol className={styles.timeline}>
                    {state === "confirmed" ? (
                      <li>
                        <span className={styles.eyebrow}>
                          {copy("Just now", "Gerade eben")}
                        </span>
                        <h4>
                          {copy("Setup confirmed", "Einrichtung bestätigt")}
                        </h4>
                        <p>
                          {copy(
                            "Constitution and proposed structure created in this mock.",
                            "Verfassung und vorgeschlagene Struktur in diesem Entwurf angelegt.",
                          )}
                        </p>
                      </li>
                    ) : null}
                    {recordedReason ? (
                      <li>
                        <span className={styles.eyebrow}>
                          {copy("Just now", "Gerade eben")}
                        </span>
                        <h4>
                          {copy("Changes requested", "Änderungen angefordert")}
                        </h4>
                        <p>{recordedReason}</p>
                      </li>
                    ) : null}
                    <li>
                      <span className={styles.eyebrow}>
                        {copy(
                          "Revision 2 · Current proposal",
                          "Revision 2 · Aktueller Vorschlag",
                        )}
                      </span>
                      <h4>
                        {copy(
                          "Source and display revised",
                          "Quelle und Darstellung überarbeitet",
                        )}
                      </h4>
                      <div className={styles.changes}>
                        <div>
                          <span>
                            {copy("Source reference", "Quellenangabe")}
                          </span>
                          <p>
                            <del>Gesetze im Internet</del>
                            <ins>
                              Bundesgesetzblatt 1949, S. 1 · Gesetze im Internet
                            </ins>
                          </p>
                        </div>
                        <div>
                          <span>
                            {copy("Paragraph display", "Absatzdarstellung")}
                          </span>
                          <p>
                            <del>
                              {copy("Separate blocks", "Einzelne Blöcke")}
                            </del>
                            <ins>
                              {copy(
                                "Running text with superscript labels",
                                "Fließtext mit hochgestellten Bezeichnungen",
                              )}
                            </ins>
                          </p>
                        </div>
                      </div>
                      <p className={styles.muted}>
                        {copy(
                          "Hierarchy and source wording unchanged.",
                          "Gliederung und Quellwortlaut unverändert.",
                        )}
                      </p>
                    </li>
                    <li>
                      <span className={styles.eyebrow}>
                        {copy("Revision 1", "Revision 1")}
                      </span>
                      <h4>
                        {copy("Proposal submitted", "Vorschlag eingereicht")}
                      </h4>
                      <p>
                        {copy(
                          "Identity, source details, three structural levels and a reading sample.",
                          "Identität, Quellenangaben, drei Gliederungsebenen und ein Lesebeispiel.",
                        )}
                      </p>
                    </li>
                  </ol>
                </Stack>
              </section>
            </PageContentsBody>
          </PageContentsLayout>
        </PageChromeSurface>
      </FullWidthPage>
      <footer className={styles.footer}>
        {copy(
          "Design mock only. Changes, notes and files stay in this browser session.",
          "Reiner Designentwurf. Änderungen, Notizen und Dateien bleiben in dieser Browsersitzung.",
        )}
        <span>Constitution Atlas</span>
      </footer>
      <dialog
        ref={withdrawal}
        className={styles.dialog}
        aria-labelledby="withdraw-title"
      >
        <h2 id="withdraw-title">
          {copy("Withdraw this proposal?", "Diesen Vorschlag zurückziehen?")}
        </h2>
        <p>
          {copy(
            "The proposal remains in the history. No constitution will be created from it.",
            "Der Vorschlag bleibt im Verlauf erhalten. Daraus wird keine Verfassung angelegt.",
          )}
        </p>
        <Inline>
          <Button type="button" onClick={() => withdrawal.current?.close()}>
            {copy("Cancel", "Abbrechen")}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setState("withdrawn");
              withdrawal.current?.close();
            }}
          >
            {copy("Withdraw proposal", "Vorschlag zurückziehen")}
          </Button>
        </Inline>
      </dialog>
      {inspected ? (
        <dialog
          className={styles.dialog}
          aria-labelledby="source-title"
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={() => setInspected(null)}
        >
          <h2 id="source-title">{inspected.revision.title}</h2>
          <p>
            {copy("Cited revision", "Zitierte Revision")}{" "}
            {inspected.revision.revision} · {inspected.citationKey}
          </p>
          <p>{inspected.revision.fileName || inspected.revision.sourceUrl}</p>
          {inspected.revision.description ? (
            <p>{inspected.revision.description}</p>
          ) : null}
          <Button type="button" onClick={() => setInspected(null)}>
            {copy("Close", "Schließen")}
          </Button>
        </dialog>
      ) : null}
      {outside ? (
        <dialog
          className={styles.dialog}
          aria-labelledby="outside-title"
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={() => setOutside("")}
        >
          <h2 id="outside-title">{outside}</h2>
          <p>
            {copy(
              "This interactive mock focuses on constitution setup. Global navigation keeps the established site design.",
              "Dieser interaktive Entwurf zeigt die Verfassungseinrichtung. Die globale Navigation übernimmt das bestehende Seitendesign.",
            )}
          </p>
          <Button type="button" onClick={() => setOutside("")}>
            {copy("Back to proposal", "Zurück zum Vorschlag")}
          </Button>
        </dialog>
      ) : null}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
