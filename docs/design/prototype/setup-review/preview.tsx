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
import { ReaderIcon } from "../../../../apps/gateway-web/app/components/ReaderIcon";
import {
  ReaderMenu,
  type ReaderMenuItem,
} from "../../../../apps/gateway-web/app/components/ReaderMenu";
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
  PageHeader,
} from "../../../../apps/gateway-web/app/components/ui";
import {
  Inline,
  Stack,
} from "../../../../apps/gateway-web/app/components/layout/Layout";
import {
  OutlineLayerEditor,
  type LayerSection,
} from "../../../../apps/gateway-web/app/admin/constitutions/OutlineLayerEditor";
import {
  StructurePreview,
  StructureTemplates,
} from "../../../../apps/gateway-web/app/admin/constitutions/StructureWorkspaceTemplate";
import {
  outlineBranches,
  updateOutlineLayers,
  placeOutlineLayer,
  removeOutlineLayer,
  outlineValidationError,
  type OutlineBranch,
  type OutlineLayer,
  explicitLayers,
} from "../../../../apps/gateway-web/app/admin/constitutions/outline-editor-model";
import {
  outlineFromTemplate,
  type ConstitutionTemplate,
} from "../../../../apps/gateway-web/lib/constitution-templates";
import { OutlineReaderPreview } from "../../../../apps/gateway-web/app/admin/constitutions/OutlineReaderPreview";
import { setupOutline } from "../../../../apps/gateway-web/lib/setup-review";
import { structureUi } from "../../../../apps/gateway-web/lib/structure-workspace";
import type { DocumentRecord } from "../../../../apps/gateway-web/lib/document-api";
import type { SettingsImpact } from "../../../../apps/gateway-web/lib/api";
import { Evidence, EvidenceLibrary } from "./Evidence";
import { sampleRoots, title } from "./sample";
import { Before } from "./Before";
import { CreationDetails, emptyBasics } from "./CreationDetails";
import { Identity, Review, History } from "./WorkflowPanels";
import {
  pages,
  views,
  workflows,
  initialLayers,
  structureProjection,
  useWorkflowState,
  type Workflow,
  type View,
  type ProposalState,
} from "./workflows";
import "../../../../apps/gateway-web/app/styles/tokens.css";
import "../../../../apps/gateway-web/app/globals.css";
import styles from "./preview.module.css";

function Preview() {
  const query = new URLSearchParams(location.search);
  const [locale, setLocale] = useState<"de" | "en">(
    query.get("lang") === "en" ? "en" : "de",
  );
  const [workflow, setWorkflow] = useState<Workflow>(
    workflows.includes(query.get("page") as Workflow)
      ? (query.get("page") as Workflow)
      : "create",
  );
  const [comparison, setComparison] = useState<"before" | "mock">(
    query.get("view") === "before" ? "before" : "mock",
  );
  const [state, setState] = useState<ProposalState>("proposed");
  const copy = (en: string, de: string) => (locale === "en" ? en : de);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function open(workflow: Workflow) {
    setWorkflow(workflow);
    const url = new URL(location.href);
    url.searchParams.set("page", workflow);
    history.replaceState(null, "", url);
    dispatchEvent(new Event("preview-navigation"));
    scrollTo(0, 0);
  }
  return (
    <TranslationProvider locale={locale}>
      <div className={styles.demo}>
        <span>
          {copy(
            "Shared constitution workspace · Interactive mock",
            "Gemeinsamer Verfassungseditor · Interaktiver Entwurf",
          )}
        </span>
        <div>
          <label className={styles.language}>
            <span className="visually-hidden">
              {copy("Preview language", "Vorschausprache")}
            </span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as "de" | "en")}
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
      <div className={styles.comparisonControls}>
        <div
          className={styles.pagePicker}
          role="group"
          aria-label={copy("Page", "Seite")}
        >
          {workflows.map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={workflow === mode}
              onClick={() => open(mode)}
            >
              {copy(pages[mode].name.en, pages[mode].name.de)}
            </button>
          ))}
        </div>
        <div
          className={styles.comparisonPicker}
          role="group"
          aria-label={copy("Before and mock", "Vorher und Entwurf")}
        >
          <button
            type="button"
            aria-pressed={comparison === "before"}
            onClick={() => setComparison("before")}
          >
            {copy("Before", "Vorher")}
          </button>
          <button
            type="button"
            aria-pressed={comparison === "mock"}
            onClick={() => setComparison("mock")}
          >
            {copy("Mock", "Entwurf")}
          </button>
        </div>
      </div>
      {workflow === "proposal" && comparison === "mock" ? (
        <div className={styles.proposalDemo}>
          <label>
            {copy("Example state", "Beispielzustand")}
            <select
              value={state}
              onChange={(event) =>
                setState(event.target.value as ProposalState)
              }
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
        </div>
      ) : null}
      {comparison === "before" ? <Before workflow={workflow} /> : null}
      <div hidden={comparison !== "mock"}>
        <EvidenceLibrary>
          <SharedWorkspace
            workflow={workflow}
            open={open}
            state={state}
            setState={setState}
          />
        </EvidenceLibrary>
      </div>
    </TranslationProvider>
  );
}

/** One shell and editor serve creation, saved settings and import proposal review. */
function SharedWorkspace({
  workflow,
  open,
  state,
  setState,
}: {
  workflow: Workflow;
  open: (workflow: Workflow) => void;
  state: ProposalState;
  setState: (state: ProposalState) => void;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const [view, setView] = useWorkflowState<View>(workflow, (key) =>
    key === "settings" ? "structure" : "identity",
  );
  const [layers, setLayers] = useWorkflowState<OutlineLayer[]>(
    workflow,
    initialLayers,
  );
  const [baseline, setBaseline] = useWorkflowState<OutlineLayer[]>(
    workflow,
    initialLayers,
  );
  const [selected, setSelected] = useWorkflowState(workflow, () => 1);
  const [section, setSection] = useWorkflowState<LayerSection>(
    workflow,
    () => "display",
  );
  const [notice, setNotice] = useWorkflowState(workflow, () => "");
  const [saved, setSaved] = useWorkflowState(workflow, () => false);
  const [revision, setRevision] = useWorkflowState<number>(workflow, (key) =>
    key === "settings" ? 3 : 2,
  );
  const [impact, setImpact] = useWorkflowState<SettingsImpact | null>(
    workflow,
    () => null,
  );
  const [created, setCreated] = useState(false),
    [basics, setBasics] = useState(emptyBasics);
  const [reason, setReason] = useState(""),
    [recordedReason, setRecordedReason] = useState("");
  const [expanded, setExpanded] = useState(() => innerWidth > 680),
    [templates, setTemplates] = useWorkflowState(workflow, () => false),
    [template, setTemplate] = useWorkflowState<ConstitutionTemplate>(
      workflow,
      () => "articles",
    );
  const [inspected, setInspected] = useState<DocumentRecord | null>(null),
    [outside, setOutside] = useState("");
  const [levelMenu, setLevelMenu] = useState<{
    index: number;
    parent: number | null;
    x: number;
    y: number;
    origin: HTMLElement;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    navigation = useRef<HTMLElement>(null),
    withdrawal = useRef<HTMLDialogElement>(null);
  usePageChromeMetrics(root, menu, navigation);
  useEffect(() => setLevelMenu(null), [workflow]);
  const layerIndex = Math.min(selected, layers.length - 1),
    layer = layers[layerIndex];
  const structural =
    workflow !== "proposal" && !(workflow === "create" && created);
  const display =
    workflow === "proposal"
      ? state === "proposed" || state === "requested"
      : !(workflow === "create" && created);
  const dirty = JSON.stringify(layers) !== JSON.stringify(baseline);
  const validationMessage = outlineValidationError(layers),
    validation = validationMessage ? t(validationMessage) : null;
  const ownerTitle =
    workflow === "create"
      ? basics.title || copy("New constitution", "Neue Verfassung")
      : title;
  const status =
    workflow === "create"
      ? created
        ? copy("Created in mock", "Im Entwurf angelegt")
        : copy("Draft", "Entwurf")
      : workflow === "settings"
        ? dirty
          ? copy("Unsaved changes", "Ungespeicherte Änderungen")
          : copy("Saved settings", "Gespeicherte Einstellungen")
        : state === "confirmed"
          ? copy("Confirmed", "Bestätigt")
          : state === "requested"
            ? copy("Changes requested", "Änderungen angefordert")
            : state === "confirming"
              ? copy("Confirmation interrupted", "Bestätigung unterbrochen")
              : state === "withdrawn"
                ? copy("Withdrawn", "Zurückgezogen")
                : copy("Ready for review", "Bereit zur Prüfung");
  function choose(next: View) {
    if (workflow === "create" && next === "review" && !created) {
      const form = document.getElementById(
        "create-constitution-details",
      ) as HTMLFormElement | null;
      if (!form?.checkValidity()) {
        setView("identity");
        requestAnimationFrame(() => form?.reportValidity());
        return;
      }
    }
    setView(next);
    setNotice("");
  }
  function change(next: OutlineLayer[]) {
    setLayers(next);
    setImpact(null);
    setSaved(false);
    setNotice("");
  }
  function checkImpact() {
    if (validation) {
      choose("structure");
      setNotice(validation);
      return;
    }
    const structuralChange =
      structureProjection(layers) !== structureProjection(baseline);
    setImpact({
      currentRevisionId: `settings-${revision}`,
      classification: structuralChange ? "migration_required" : "display_only",
      affectedVersionIds: ["version-1949", "version-2022"],
      affectedDraftSessionIds: ["draft-example"],
      violations: [],
      reasons: structuralChange
        ? [
            copy(
              "The proposed structure differs from the structure pinned by existing text. A reviewed migration is needed.",
              "Der vorgeschlagene Aufbau weicht von der im vorhandenen Text festgelegten Struktur ab. Eine geprüfte Migration ist erforderlich.",
            ),
          ]
        : [
            copy(
              "The example display change can be saved without changing historical structure pins.",
              "Die beispielhafte Darstellungsänderung lässt sich ohne Änderung historischer Strukturbezüge speichern.",
            ),
          ],
    });
    setView("review");
  }
  function primary() {
    if (workflow === "settings") checkImpact();
    else choose("review");
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
            <div className={styles.hierarchyRow}>
              <button
                type="button"
                aria-current={layerIndex === branch.index ? "true" : undefined}
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
              <button
                type="button"
                className={styles.levelMenu}
                aria-label={`${copy("Actions for", "Aktionen für")} ${layers[branch.index].displayLabel}`}
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setSelected(branch.index);
                  setLevelMenu({
                    index: branch.index,
                    parent: branch.parent,
                    x: box.left,
                    y: box.bottom,
                    origin: event.currentTarget,
                  });
                }}
              >
                ⋯
              </button>
            </div>
            {branch.children.length ? hierarchy(branch.children) : null}
          </li>
        ))}
      </ul>
    );
  }
  const menuItems: ReaderMenuItem[] = levelMenu
    ? [
        {
          id: "display",
          label: copy("Edit display", "Darstellung bearbeiten"),
          onSelect: () => {
            setSection("display");
            choose("structure");
            setLevelMenu(null);
          },
        },
        ...(structural
          ? [
              {
                id: "child",
                label: copy("Add child level", "Unterebene hinzufügen"),
                onSelect: () => {
                  change(
                    placeOutlineLayer(
                      layers,
                      copy("New level", "Neue Ebene"),
                      "child",
                      levelMenu.index,
                      levelMenu.parent,
                    ),
                  );
                  setSelected(layers.length);
                  setView("structure");
                  setLevelMenu(null);
                },
              },
              {
                id: "remove",
                label: copy("Remove level", "Ebene entfernen"),
                onSelect: () => {
                  change(removeOutlineLayer(layers, levelMenu.index));
                  setSelected(Math.max(0, levelMenu.index - 1));
                  setView("structure");
                  setLevelMenu(null);
                },
              },
            ]
          : workflow === "proposal" && display
            ? [
                {
                  id: "request",
                  label: copy(
                    "Request structural changes",
                    "Strukturänderung anfordern",
                  ),
                  onSelect: () => {
                    setLevelMenu(null);
                    requestChanges();
                  },
                },
              ]
            : []),
      ]
    : [];
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
        <SiteHeader user={{ email: "admin@example.test", roles: ["admin"] }} />
      </div>
      <FullWidthPage template="workspace">
        <PageChromeSurface ref={root} className={styles.surface}>
          <div className={styles.header}>
            <PageHeader
              separator={false}
              title={t(pages[workflow].title)}
              breadcrumbs={[
                {
                  href: "#",
                  label:
                    workflow === "proposal"
                      ? copy("Imports", "Importe")
                      : copy("Constitutions", "Verfassungen"),
                },
                { label: t(pages[workflow].name) },
              ]}
              meta={t(pages[workflow].description)}
            />
          </div>
          <PageMenuFrame ref={menu}>
            <PageMenuBar
              compact
              label={copy("Constitution workspace", "Verfassungseditor")}
              role="toolbar"
            >
              <button
                type="button"
                className={styles.tool}
                aria-label={copy(
                  expanded ? "Hide overview" : "Show overview",
                  expanded ? "Übersicht ausblenden" : "Übersicht einblenden",
                )}
                title={copy(
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
                aria-label={copy("Workspace views", "Ansichten des Editors")}
              >
                {views.map((tab, index) => (
                  <button
                    type="button"
                    key={tab.id}
                    role="tab"
                    id={`setup-tab-${tab.id}`}
                    aria-controls={`setup-panel-${tab.id}`}
                    aria-label={t(tab.label)}
                    title={t(tab.label)}
                    aria-selected={view === tab.id}
                    tabIndex={view === tab.id ? 0 : -1}
                    className={styles.tool}
                    onClick={() => choose(tab.id)}
                    onKeyDown={(event) => keyboard(event, index)}
                  >
                    <ReaderIcon name={tab.icon} />
                    <span className={styles.toolLabel}>{t(tab.label)}</span>
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
                aria-label={copy(
                  "Constitution overview",
                  "Verfassungsübersicht",
                )}
                className={styles.contents}
              >
                <p className={styles.eyebrow}>
                  {copy("This constitution", "Diese Verfassung")}
                </p>
                <div className={styles.owner}>
                  <span>{workflow === "create" ? basics.isoCode : "DE"}</span>
                  <div>
                    {workflow === "create"
                      ? basics.countryName
                      : copy("Germany", "Deutschland")}
                    <small>
                      {workflow === "proposal"
                        ? copy("Submitted proposal", "Eingereichter Vorschlag")
                        : workflow === "settings"
                          ? copy(
                              "Saved constitution",
                              "Gespeicherte Verfassung",
                            )
                          : copy("New constitution", "Neue Verfassung")}
                    </small>
                  </div>
                </div>
                <div className={styles.division}>
                  <p className={styles.eyebrow}>
                    {copy("Hierarchy", "Gliederung")}
                  </p>
                  {hierarchy(outlineBranches(layers))}
                  {structural ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        change(
                          placeOutlineLayer(
                            layers,
                            copy("New level", "Neue Ebene"),
                            "root",
                            layerIndex,
                            null,
                          ),
                        );
                        setSelected(layers.length);
                        setView("structure");
                      }}
                    >
                      {copy("New level", "Neue Ebene")}
                    </Button>
                  ) : null}
                </div>
                <p className={styles.sidebarNote}>
                  {workflow === "proposal"
                    ? copy(
                        "Structure corrections need a revised proposal. Display can be adjusted here.",
                        "Strukturkorrekturen benötigen einen überarbeiteten Vorschlag. Die Darstellung kann hier angepasst werden.",
                      )
                    : workflow === "settings"
                      ? copy(
                          "Published versions retain their pinned structure.",
                          "Veröffentlichte Fassungen behalten ihre festgelegte Struktur.",
                        )
                      : copy(
                          "Create setup first. Documents and wording follow afterwards.",
                          "Zuerst die Einrichtung anlegen. Dokumente und Wortlaut folgen danach.",
                        )}
                </p>
              </nav>
            }
          >
            <PageContentsBody className={styles.body}>
              <div className={styles.selectedHeader}>
                <div>
                  <Inline>
                    <Badge
                      tone={
                        (workflow === "proposal" && state === "requested") ||
                        dirty
                          ? "changed"
                          : workflow === "create" && created
                            ? "added"
                            : "info"
                      }
                    >
                      {status}
                    </Badge>
                    {workflow !== "create" ? (
                      <span className={styles.revision}>
                        {copy("Revision", "Revision")} {revision}
                      </span>
                    ) : null}
                  </Inline>
                  <h2>{ownerTitle}</h2>
                </div>
                {view !== "review" &&
                !(workflow === "create" && created) &&
                !(
                  workflow === "proposal" &&
                  ["confirmed", "withdrawn"].includes(state)
                ) ? (
                  <Button type="button" onClick={primary}>
                    {workflow === "settings"
                      ? copy("Review impact", "Auswirkungen prüfen")
                      : copy("Review and confirm", "Zur Prüfung")}
                    <ReaderIcon name="right" />
                  </Button>
                ) : null}
              </div>
              {workflow === "create" ? (
                <nav
                  className="creation-steps"
                  aria-label={copy("Creation steps", "Schritte zum Anlegen")}
                >
                  {[
                    ["identity", copy("Details", "Angaben")],
                    ["structure", copy("Structure", "Struktur")],
                    ["review", copy("Review and create", "Prüfen und anlegen")],
                  ].map(([id, label], index) => (
                    <span
                      key={id}
                      aria-current={view === id ? "step" : undefined}
                    >
                      {index + 1}. {label}
                    </span>
                  ))}
                </nav>
              ) : null}
              {notice ? (
                <p role="status" className={styles.notice}>
                  <ReaderIcon name="check" />
                  {notice}
                </p>
              ) : null}
              {workflow === "create" && created ? (
                <Alert tone="success">
                  {copy(
                    "Constitution and initial structure created in this mock. No wording has been published.",
                    "Verfassung und Anfangsstruktur im Entwurf angelegt. Es wurde kein Wortlaut veröffentlicht.",
                  )}
                </Alert>
              ) : null}
              {workflow === "proposal" && state === "requested" ? (
                <Alert tone="info">
                  {recordedReason ||
                    copy(
                      "Please verify the source reference before confirming.",
                      "Bitte prüfen Sie die Quellenangabe vor der Bestätigung.",
                    )}{" "}
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      setState("proposed");
                      setNotice(
                        copy(
                          "Revised example loaded.",
                          "Überarbeitetes Beispiel geladen.",
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
              {workflow === "proposal" && state === "confirmed" ? (
                <Alert tone="success">
                  {copy(
                    "Constitution and structure created. Importing and publishing wording remain separate steps.",
                    "Verfassung und Struktur sind angelegt. Textimport und Veröffentlichung bleiben eigene Schritte.",
                  )}
                </Alert>
              ) : null}
              {workflow === "proposal" && state === "confirming" ? (
                <Alert tone="info">
                  {copy(
                    "Resume the interrupted confirmation without creating a second constitution.",
                    "Setzen Sie die unterbrochene Bestätigung fort, ohne eine zweite Verfassung anzulegen.",
                  )}
                </Alert>
              ) : null}
              {workflow === "proposal" && state === "withdrawn" ? (
                <Alert tone="info">
                  {copy(
                    "This proposal was withdrawn. Details and history remain available.",
                    "Der Vorschlag wurde zurückgezogen. Angaben und Verlauf bleiben verfügbar.",
                  )}
                </Alert>
              ) : null}
              <section
                id="setup-panel-identity"
                role="tabpanel"
                aria-labelledby="setup-tab-identity"
                hidden={view !== "identity"}
              >
                <div hidden={workflow !== "create"}>
                  <CreationDetails
                    onSummary={setBasics}
                    onContinue={() => choose("structure")}
                    onSettings={() => open("settings")}
                    disabled={created}
                  />
                </div>
                {workflow !== "create" ? (
                  <Stack gap="section">
                    <Identity
                      workflow={workflow}
                      choose={choose}
                      revision={revision}
                    />
                    <section>
                      <div className={styles.sectionHeading}>
                        <h3>
                          {copy("Structure at a glance", "Aufbau im Überblick")}
                        </h3>
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
                        {layers.map((entry, index) => (
                          <span key={entry.kindCode}>
                            {index ? <ReaderIcon name="right" /> : null}
                            {entry.displayLabel}
                          </span>
                        ))}
                      </div>
                      {workflow === "proposal" ? (
                        <div className={styles.excerpt}>
                          <OutlineReaderPreview
                            roots={sampleRoots}
                            outline={setupOutline(layers)}
                          />
                        </div>
                      ) : null}
                    </section>
                  </Stack>
                ) : null}
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
                      {workflow === "proposal"
                        ? copy(
                            "Display changes update the preview; structural changes require a request.",
                            "Darstellungsänderungen aktualisieren die Vorschau; Strukturänderungen benötigen eine Anfrage.",
                          )
                        : copy(
                            "Select a level on the left. Changes appear immediately in the reading preview.",
                            "Wählen Sie links eine Ebene. Änderungen erscheinen sofort in der Leservorschau.",
                          )}
                    </p>
                  </div>
                  {workflow === "create" && !created ? (
                    <Button
                      type="button"
                      aria-expanded={templates}
                      onClick={() => setTemplates(!templates)}
                    >
                      {copy("Choose template", "Vorlage wählen")}
                    </Button>
                  ) : null}
                </div>
                {workflow === "create" && templates && !created ? (
                  <div className={styles.templatePanel}>
                    <StructureTemplates
                      value={template}
                      onChoose={(id) => {
                        setTemplate(id);
                        change(explicitLayers(outlineFromTemplate(id), false));
                        setSelected(0);
                        setTemplates(false);
                      }}
                    />
                  </div>
                ) : null}
                {validation ? <Alert tone="error">{validation}</Alert> : null}
                <div className={styles.structureGrid} data-structure-grid>
                  {layer ? (
                    <section
                      className={styles.levelEditor}
                      aria-label={copy("Selected level", "Ausgewählte Ebene")}
                    >
                      <header>
                        <span className={styles.eyebrow}>
                          {copy("Selected level", "Ausgewählte Ebene")}
                        </span>
                        <h3>{layer.displayLabel}</h3>
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
                          layer={layer}
                          index={layerIndex}
                          layers={layers}
                          section={section}
                          structural={structural}
                          display={display}
                          update={(index, patch) =>
                            change(updateOutlineLayers(layers, index, patch))
                          }
                          removeLayer={
                            structural
                              ? (index) => {
                                  change(removeOutlineLayer(layers, index));
                                  setSelected(Math.max(0, index - 1));
                                }
                              : undefined
                          }
                        />
                        {workflow === "proposal" && section !== "display" ? (
                          <p className={styles.muted}>
                            {copy(
                              "Request a correction to change this proposed hierarchy.",
                              "Fordern Sie eine Korrektur an, um die vorgeschlagene Gliederung zu ändern.",
                            )}
                          </p>
                        ) : null}
                      </div>
                    </section>
                  ) : (
                    <p>
                      {copy(
                        "Add a level to define the hierarchy.",
                        "Fügen Sie eine Ebene für die Gliederung hinzu.",
                      )}
                    </p>
                  )}
                  <StructurePreview
                    layers={layers}
                    sampleRoots={workflow === "proposal" ? sampleRoots : []}
                  />
                </div>
                <Inline className={styles.saveRow}>
                  {workflow === "proposal" && display ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => {
                          setSaved(true);
                          setNotice(
                            copy(
                              "Display saved in this mock.",
                              "Darstellung im Entwurf gespeichert.",
                            ),
                          );
                        }}
                      >
                        {copy("Save display", "Darstellung speichern")}
                      </Button>
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
                    </>
                  ) : (
                    <Button
                      type="button"
                      onClick={primary}
                      disabled={workflow === "create" && created}
                    >
                      {workflow === "settings"
                        ? copy("Review impact", "Auswirkungen prüfen")
                        : copy("Continue to review", "Weiter zur Prüfung")}
                      <ReaderIcon name="right" />
                    </Button>
                  )}
                </Inline>
              </section>
              <section
                id="setup-panel-documents"
                role="tabpanel"
                aria-labelledby="setup-tab-documents"
                hidden={view !== "documents"}
              >
                <div hidden={workflow !== "create"}>
                  <Stack gap="card">
                    <h3>{copy("Documents", "Dokumente")}</h3>
                    <p className={styles.muted}>
                      {created
                        ? copy(
                            "Setup has been simulated. The settings example shows attachment controls for an existing constitution.",
                            "Die Einrichtung wurde simuliert. Das Einstellungsbeispiel zeigt die Dokumentfunktionen für eine vorhandene Verfassung.",
                          )
                        : copy(
                            "Create the constitution first. Documents can then be linked from its settings.",
                            "Legen Sie zuerst die Verfassung an. Danach lassen sich Dokumente in ihren Einstellungen verknüpfen.",
                          )}
                    </p>
                    <Button
                      type="button"
                      onClick={() =>
                        created ? open("settings") : choose("identity")
                      }
                    >
                      {created
                        ? copy(
                            "View settings example",
                            "Einstellungsbeispiel ansehen",
                          )
                        : copy("Back to details", "Zurück zu den Angaben")}
                    </Button>
                  </Stack>
                </div>
                <div
                  data-evidence-owner="constitution"
                  hidden={workflow !== "settings"}
                >
                  <p className={styles.muted}>
                    {copy(
                      "Documents attached to this constitution. Their library records stay independent from structure edits.",
                      "Mit dieser Verfassung verknüpfte Dokumente. Die Bibliothekseinträge bleiben von Strukturänderungen unabhängig.",
                    )}
                  </p>
                  <Evidence context="constitution" onInspect={setInspected} />
                </div>
                <div
                  data-evidence-owner="setup_proposal"
                  hidden={workflow !== "proposal"}
                >
                  <p className={styles.muted}>
                    {copy(
                      "Private evidence for this setup proposal, separate from its submitted source details.",
                      "Private Belege dieses Einrichtungsvorschlags, getrennt von den eingereichten Quellenangaben.",
                    )}
                  </p>
                  <Evidence context="setup_proposal" onInspect={setInspected} />
                </div>
              </section>
              <section
                id="setup-panel-review"
                role="tabpanel"
                aria-labelledby="setup-tab-review"
                hidden={view !== "review"}
              >
                <Review
                  workflow={workflow}
                  layers={layers}
                  basics={basics}
                  state={state}
                  reason={reason}
                  setReason={setReason}
                  recordedReason={recordedReason}
                  choose={choose}
                  created={created}
                  onCreate={() => {
                    if (!validation) {
                      setCreated(true);
                      setNotice(
                        copy(
                          "Initial setup created locally.",
                          "Anfangseinrichtung lokal angelegt.",
                        ),
                      );
                    }
                  }}
                  onConfirm={() => {
                    setState("confirmed");
                    setNotice("");
                  }}
                  onRequest={() => {
                    setRecordedReason(reason);
                    setState("requested");
                  }}
                  withdrawal={withdrawal}
                  impact={impact}
                  checkImpact={checkImpact}
                  onSave={() => {
                    if (
                      !impact ||
                      impact.classification === "migration_required"
                    )
                      return;
                    setRevision(revision + 1);
                    setBaseline(layers);
                    setImpact(null);
                    setSaved(true);
                    setNotice(
                      copy(
                        "New example settings revision saved.",
                        "Neue Beispieleinstellungsrevision gespeichert.",
                      ),
                    );
                  }}
                  revision={revision}
                  validation={validation}
                />
              </section>
              <section
                id="setup-panel-history"
                role="tabpanel"
                aria-labelledby="setup-tab-history"
                hidden={view !== "history"}
              >
                <History
                  workflow={workflow}
                  revision={revision}
                  saved={saved || (workflow === "settings" && revision > 3)}
                  created={created}
                  recordedReason={recordedReason}
                  confirmed={state === "confirmed"}
                  restore={() => {
                    change(
                      initialLayers("settings").map((entry) =>
                        entry.kindCode === "paragraph"
                          ? { ...entry, presentation: "section" }
                          : entry,
                      ),
                    );
                    setView("review");
                    setNotice(
                      copy(
                        "Previous display restored as an unsaved draft. Check the impact before saving.",
                        "Vorige Darstellung als ungespeicherten Entwurf wiederhergestellt. Prüfen Sie die Auswirkungen vor dem Speichern.",
                      ),
                    );
                  }}
                />
              </section>
            </PageContentsBody>
          </PageContentsLayout>
        </PageChromeSurface>
      </FullWidthPage>
      <footer className={styles.footer}>
        {copy(
          "Interactive mock · Sample data · No live application changes",
          "Interaktiver Entwurf · Beispieldaten · Keine Änderungen an der Live-Anwendung",
        )}
        <span>Constitution Atlas</span>
      </footer>
      {levelMenu ? (
        <ReaderMenu
          title={copy("Level actions", "Aktionen für Ebene")}
          items={menuItems}
          position={levelMenu}
          origin={levelMenu.origin}
          onClose={() => setLevelMenu(null)}
        />
      ) : null}
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
            "Its details remain in the history.",
            "Die Angaben bleiben im Verlauf erhalten.",
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
              "This mock covers creation, settings and import proposal review. Use the page switch above to compare them.",
              "Dieser Entwurf zeigt Anlegen, Einstellungen und Importprüfung. Vergleichen Sie die Seiten über den Umschalter oben.",
            )}
          </p>
          <Button type="button" onClick={() => setOutside("")}>
            {copy("Back to workspace", "Zurück zum Editor")}
          </Button>
        </dialog>
      ) : null}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
