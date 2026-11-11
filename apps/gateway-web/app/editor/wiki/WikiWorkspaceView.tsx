"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  FilePenLine,
  FileText,
  History,
  Info,
  PanelRight,
  Save,
} from "lucide-react";
import type { WikiEditorTemplateProps } from "../../components/WikiEditorTemplate";
import type { WikiPageRevision } from "../../../lib/api";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { WikiContent } from "../../components/WikiContent";
import {
  FullWidthPage,
  PageChromeSurface,
  PageMenuBar,
  PageMenuDivider,
  PageMenuFrame,
} from "../../components/layout/PageChrome";
import chrome from "../../components/layout/PageChrome.module.css";
import { HelpTooltip } from "../../components/HelpTooltip";
import { useTranslation } from "../../components/TranslationProvider";
import { useWikiWorkspace, type WikiWorkspaceModel } from "./useWikiWorkspace";
import { WikiWritingSurface } from "./WikiWritingSurface";
import { WikiSourceFields } from "./WikiSourceFields";
import { WikiRevisionHistory } from "./WikiRevisionHistory";
import {
  WikiDialog,
  WikiPublicationReview,
  WikiViewerPreview,
} from "./WikiWorkspaceDialogs";
import { wikiUi } from "./wiki-messages";
import styles from "../../components/WikiEditorTemplate.module.css";

type View = "content" | "sources" | "history";
type Popup = "review" | "viewer" | "published" | "revision" | null;
type Details = { model: WikiWorkspaceModel; props: WikiEditorTemplateProps };
function currentPage(model: WikiWorkspaceModel): WikiPageRevision {
  return {
    ...model.saved,
    ...model.draft,
    sourceUrls: model.draft.sourceUrls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean),
  } as WikiPageRevision;
}

export function WikiWorkspaceView(props: WikiEditorTemplateProps) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const { form: formRef, ...model } = useWikiWorkspace({
    ...props,
    initialDraft: props.draft,
    initialPublished: props.published,
    initialMessage: props.query.error
      ? "error"
      : props.query.saved
        ? "saved"
        : props.query.published
          ? "published"
          : undefined,
  });
  const [view, setView] = useState<View>("content"),
    [preview, setPreview] = useState(false),
    [previewMode, setPreviewMode] = useState<"working" | "published">(
      "working",
    );
  const [popup, setPopup] = useState<Popup>(null),
    [revision, setRevision] = useState<WikiPageRevision | null>(null);
  const pane = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const preference = localStorage.getItem("atlas:wiki:preview");
        setPreview(
          preference === null ? window.innerWidth > 900 : preference === "true",
        );
      } catch {
        setPreview(window.innerWidth > 900);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  function togglePreview(next = !preview) {
    if (!next)
      pane.current
        ?.querySelectorAll<HTMLElement>(":popover-open")
        .forEach((element) => element.hidePopover());
    setPreview(next);
    try {
      localStorage.setItem("atlas:wiki:preview", String(next));
    } catch {
      /* Pane preference is optional. */
    }
    if (next && window.innerWidth <= 900)
      setTimeout(
        () =>
          pane.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        30,
      );
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const views: View[] = ["content", "sources", "history"];
    const next =
      event.key === "Home"
        ? "content"
        : event.key === "End"
          ? "history"
          : views[
              (views.indexOf(view) + (event.key === "ArrowLeft" ? 2 : 1)) %
                views.length
            ];
    setView(next);
    formRef.current
      ?.querySelector<HTMLButtonElement>(`#wiki-tab-${next}`)
      ?.focus();
  }
  function edit() {
    setPopup(null);
    setView("content");
    setTimeout(
      () =>
        formRef.current
          ?.querySelector<HTMLElement>("[contenteditable]")
          ?.focus(),
      30,
    );
  }
  const previewPage =
    previewMode === "working" ? currentPage(model) : model.published;
  const close = () => setPopup(null);
  const content = (
    <PageChromeSurface
      className={`${styles.workspace} ${props.embedded ? styles.embedded : ""}`}
    >
      <form
        ref={formRef}
        data-wiki-owner={props.owner.targetType}
        onChange={(event) => {
          if (
            event.target instanceof HTMLInputElement &&
            event.target.type === "file"
          )
            model.fileChanged();
        }}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (props.canEdit) void model.save();
        }}
      >
        <input type="hidden" name="targetType" value={props.owner.targetType} />
        <input type="hidden" name="targetId" value={props.owner.targetId} />
        <input
          type="hidden"
          name="expectedRevisionId"
          value={model.saved?.id ?? ""}
        />
        <input type="hidden" name="revisionId" value={model.saved?.id ?? ""} />
        <input type="hidden" name="returnTo" value={props.returnTo ?? ""} />
        <WorkspaceHeading
          model={model}
          props={props}
          onPublished={() => setPopup("published")}
        />
        <PageMenuFrame>
          <PageMenuBar
            compact
            label={copy("Wiki workspace", "Wiki-Arbeitsbereich")}
            className="workspace-menu"
          >
            <div
              className="workspace-tabs"
              role="tablist"
              aria-label={copy("Wiki views", "Wiki-Ansichten")}
            >
              {(["content", "sources", "history"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`wiki-tab-${id}`}
                  className={chrome.tool}
                  aria-label={t(wikiUi[id])}
                  aria-selected={view === id}
                  aria-controls={`wiki-${id}`}
                  tabIndex={view === id ? 0 : -1}
                  onClick={() => setView(id)}
                  onKeyDown={keyboard}
                >
                  {tabIcon(id)}
                  <span>{t(wikiUi[id])}</span>
                  {id === "sources" ? (
                    <span className="tab-count">
                      {model.draft.citations.length + model.draft.images.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="menu-end">
              <span className="retention-note">
                <Check size={14} />
                {model.retained
                  ? copy("Draft retained", "Entwurf behalten")
                  : copy("Draft workspace", "Entwurfsbereich")}
              </span>
              <PageMenuDivider />
              <button
                type="button"
                className={chrome.tool}
                aria-label={
                  preview
                    ? copy("Hide preview pane", "Vorschau ausblenden")
                    : copy("Show preview pane", "Vorschau einblenden")
                }
                aria-expanded={preview}
                aria-controls="wiki-preview"
                onClick={() => togglePreview()}
              >
                <PanelRight size={18} />
                <span>{copy("Preview", "Vorschau")}</span>
              </button>
            </div>
          </PageMenuBar>
        </PageMenuFrame>
        <div className="workspace-layout" data-preview={preview}>
          <div className="editor-column">
            <WorkspaceNotices model={model} props={props} />
            <fieldset
              className="wiki-fields"
              disabled={Boolean(model.pending) || !model.hydrated}
            >
              <div
                id="wiki-content"
                role="tabpanel"
                aria-labelledby="wiki-tab-content"
                hidden={view !== "content"}
              >
                <WikiContentFields
                  model={model}
                  props={props}
                  active={view === "content"}
                  onSources={() => setView("sources")}
                />
              </div>
              <div
                id="wiki-sources"
                role="tabpanel"
                aria-labelledby="wiki-tab-sources"
                hidden={view !== "sources"}
              >
                <WikiSourceFields
                  model={model}
                  canEdit={props.canEdit}
                  canCreate={props.canEdit}
                />
              </div>
            </fieldset>
            <div
              id="wiki-history"
              role="tabpanel"
              aria-labelledby="wiki-tab-history"
              hidden={view !== "history"}
            >
              <WikiRevisionHistory
                revisions={model.history}
                actorId={props.actorId}
                links={props.historyLinks}
                onInspect={(item) => {
                  setRevision(item);
                  setPopup("revision");
                }}
              />
            </div>
          </div>
          <aside
            id="wiki-preview"
            ref={pane}
            className="preview-pane"
            hidden={!preview}
            aria-label={copy("Live page preview", "Live-Seitenvorschau")}
          >
            <div className="preview-pane-heading">
              <span className="eyebrow">
                {copy("PAGE PREVIEW", "SEITENVORSCHAU")}
              </span>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setPopup("viewer")}
              >
                <ExternalLink size={14} />
                {copy("Open viewer", "Viewer öffnen")}
              </button>
            </div>
            <div className="preview-mode">
              <button
                type="button"
                aria-pressed={previewMode === "working"}
                onClick={() => setPreviewMode("working")}
              >
                {copy("Your draft", "Dein Entwurf")}
              </button>
              <button
                type="button"
                aria-pressed={previewMode === "published"}
                onClick={() => setPreviewMode("published")}
              >
                {copy("Published", "Veröffentlicht")}
              </button>
            </div>
            <p className="preview-explanation">
              {previewMode === "working"
                ? copy(
                    "Updates as you write. Only staff can see this draft.",
                    "Aktualisiert sich beim Schreiben. Nur die Redaktion kann diesen Entwurf sehen.",
                  )
                : copy(
                    "What readers can currently see.",
                    "Was Lesende derzeit sehen können.",
                  )}
            </p>
            {previewPage ? (
              <WikiViewerPreview
                page={previewPage}
                ownerName={props.ownerName}
                onClose={() => togglePreview(false)}
                canEdit={props.canEdit}
                onEdit={edit}
              />
            ) : (
              <p>
                {copy(
                  "This Wiki has not been published yet.",
                  "Dieses Wiki wurde noch nicht veröffentlicht.",
                )}
              </p>
            )}
          </aside>
        </div>
        <WikiWorkspaceFooter
          model={model}
          canEdit={props.canEdit}
          canPublish={props.canPublish}
          onReview={() => setPopup("review")}
        />
      </form>
      <WorkspacePopups
        popup={popup}
        revision={revision}
        model={model}
        props={props}
        close={close}
        onEdit={edit}
      />
    </PageChromeSurface>
  );
  return props.embedded ? (
    content
  ) : (
    <FullWidthPage template="workspace">{content}</FullWidthPage>
  );
}
function tabIcon(view: View) {
  return view === "content" ? (
    <FilePenLine size={18} />
  ) : view === "sources" ? (
    <FileText size={18} />
  ) : (
    <History size={18} />
  );
}
function WorkspaceHeading({
  model,
  props,
  onPublished,
}: Details & { onPublished: () => void }) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de }),
    Heading = props.embedded ? "h2" : "h1";
  return (
    <>
      <div className="wiki-breadcrumbs">
        <Breadcrumbs
          items={[
            { href: "/editor", label: copy("Editor", "Redaktion") },
            { href: props.publicHref, label: props.ownerName },
            { label: "Wiki" },
          ]}
        />
      </div>
      <header className="workspace-heading">
        <div className="workspace-heading-inner">
          <div>
            <div className="eyebrow owner-eyebrow">
              {t(wikiUi[props.owner.targetType])} / {props.ownerName}
            </div>
            <Heading>
              {t(props.canEdit ? wikiUi.title : wikiUi.reviewTitle)}
            </Heading>
            <p>
              {t(wikiUi.subtitle)}
              <HelpTooltip label={t(wikiUi.scopeInfo)}>
                <Info size={15} />
              </HelpTooltip>
            </p>
          </div>
          <div className="heading-actions">
            <span className="status-badge">
              <span />
              {model.saved &&
              model.saved.id === model.published?.id &&
              !model.dirty
                ? copy("Published", "Veröffentlicht")
                : copy("Unpublished draft", "Unveröffentlichter Entwurf")}
            </span>
            <button
              type="button"
              className="quiet-button"
              onClick={onPublished}
            >
              <ExternalLink size={15} />
              {copy("View published page", "Veröffentlichte Seite")}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
function WorkspaceNotices({ model }: Details) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  return (
    <>
      {model.error ? (
        <p className="wiki-error" role="alert">
          {model.error}
        </p>
      ) : null}
      {model.notice ? (
        <p className="wiki-notice" role="status">
          {model.notice}
        </p>
      ) : null}
      {model.recovery ? (
        <div className="wiki-recovery">
          <p>{t(wikiUi.recovery)}</p>
          <button
            type="button"
            className="btn"
            disabled={model.documentPending}
            onClick={model.recover}
          >
            {copy(
              "Recover retained edits",
              "Behaltene Eingaben wiederherstellen",
            )}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={model.discardRecovery}
          >
            {copy("Use saved draft", "Gespeicherten Entwurf verwenden")}
          </button>
        </div>
      ) : null}
    </>
  );
}
function WorkspacePopups({
  popup,
  revision,
  model,
  props,
  close,
  onEdit,
}: Details & {
  popup: Popup;
  revision: WikiPageRevision | null;
  close: () => void;
  onEdit: () => void;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  if (popup === "review")
    return (
      <WikiPublicationReview
        model={model}
        ownerName={props.ownerName}
        canEdit={props.canEdit}
        canPublish={props.canPublish}
        close={close}
        onEdit={onEdit}
      />
    );
  if (!popup) return null;
  const page =
    popup === "viewer"
      ? currentPage(model)
      : popup === "revision"
        ? revision
        : model.published;
  const title =
    popup === "viewer"
      ? copy(
          "Viewer preview · current draft",
          "Viewer-Vorschau · aktueller Entwurf",
        )
      : popup === "published"
        ? copy("Published page", "Veröffentlichte Seite")
        : copy("Historical Wiki revision", "Historische Wiki-Revision");
  return (
    <WikiDialog title={title} close={close}>
      <div className="standalone-page">
        {page ? (
          <WikiViewerPreview
            page={page}
            ownerName={props.ownerName}
            onClose={close}
            canEdit={props.canEdit}
            onEdit={onEdit}
          />
        ) : (
          <p>
            {copy(
              "This Wiki has not been published yet.",
              "Dieses Wiki wurde noch nicht veröffentlicht.",
            )}
          </p>
        )}
      </div>
      {popup === "published" ? (
        <footer className="dialog-actions">
          <a
            className="btn"
            href={props.publicHref}
            target="_blank"
            rel="noreferrer"
          >
            {copy("View public page", "Öffentliche Seite ansehen")}
          </a>
        </footer>
      ) : null}
    </WikiDialog>
  );
}
function WikiContentFields({
  model,
  props,
  active,
  onSources,
}: Details & { active: boolean; onSources: () => void }) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  return (
    <section className="content-view">
      <div className="section-intro">
        <span className="eyebrow">{copy("THE PAGE", "DIE SEITE")}</span>
        <h2>
          {copy("Context, in your own words", "Kontext in deinen Worten")}
        </h2>
        <p>
          {copy(
            "Write a concise introduction, then tell the wider story.",
            "Beginne mit einer kurzen Einführung und erzähle dann die ganze Geschichte.",
          )}
        </p>
      </div>
      {props.canEdit ? (
        <>
          <div className="summary-field">
            <div className="field-heading">
              <label htmlFor="wiki-summary">
                {copy("Short description", "Kurzbeschreibung")}
                <span className="required-marker" aria-hidden="true" />
              </label>
              <HelpTooltip
                label={copy(
                  "A short introduction shown above the page text. Required, up to 500 characters.",
                  "Eine kurze Einführung über dem Seitentext. Erforderlich, höchstens 500 Zeichen.",
                )}
              >
                <Info size={15} />
              </HelpTooltip>
              <span className="character-count">
                {model.draft.summary.length}/500
              </span>
            </div>
            <textarea
              id="wiki-summary"
              name="summary"
              maxLength={500}
              rows={3}
              value={model.draft.summary}
              onChange={(event) =>
                model.update({ summary: event.target.value })
              }
            />
          </div>
          <div className="body-field">
            <div className="field-heading">
              <span>{copy("Page text", "Seitentext")}</span>
              <span className="character-count">
                {model.draft.body.trim().split(/\s+/).filter(Boolean).length}{" "}
                {copy("words", "Wörter")}
              </span>
            </div>
            <input type="hidden" name="body" value={model.draft.body} />
            <WikiWritingSurface
              key={model.writerKey}
              value={model.draft}
              onChange={model.writing}
              locale={props.locale}
              citations={model.draft.citations}
              canCreate
              disabled={Boolean(model.pending) || !model.hydrated}
              active={active}
              onPendingChange={model.setCitationPending}
              onCitationAdded={model.addCitation}
            />
          </div>
        </>
      ) : (
        <WikiContent page={currentPage(model)} preview />
      )}
      <div className="content-footnote">
        <FileText size={16} />
        <span>
          {model.draft.citations.length}{" "}
          {copy(
            "document citations linked to this draft.",
            "Dokumentbelege mit diesem Entwurf verknüpft.",
          )}
        </span>
        <button type="button" className="text-button" onClick={onSources}>
          {copy("Manage sources", "Quellen verwalten")}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
function WikiWorkspaceFooter({
  model,
  canEdit,
  canPublish,
  onReview,
}: {
  model: WikiWorkspaceModel;
  canEdit: boolean;
  canPublish: boolean;
  onReview: () => void;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const status = model.fileDirty
    ? copy(
        "Selected files stay on this page until saved",
        "Ausgewählte Dateien bleiben bis zum Speichern auf dieser Seite",
      )
    : model.dirty
      ? model.retained
        ? copy("Retained in this browser", "In diesem Browser behalten")
        : copy(
            "Keep this page open to retain your changes",
            "Lass diese Seite geöffnet, um deine Eingaben zu behalten",
          )
      : model.saved?.publishedAt
        ? copy("Published", "Veröffentlicht")
        : copy("Not yet published", "Noch nicht veröffentlicht");
  return (
    <div className="workspace-footer">
      <div className="workspace-footer-inner">
        <div className="save-status">
          <span className={`small-dot ${model.dirty ? "unsaved" : ""}`} />
          <div>
            <strong>
              {model.dirty
                ? copy("Unsaved changes", "Ungespeicherte Änderungen")
                : copy("Draft saved", "Entwurf gespeichert")}
            </strong>
            <small>{status}</small>
          </div>
        </div>
        <div className="footer-actions">
          {canEdit ? (
            <button
              type="button"
              className="btn save-button"
              disabled={
                !model.hydrated ||
                Boolean(model.pending) ||
                model.documentPending
              }
              onClick={() => void model.save()}
            >
              <Save size={16} />
              {t(model.pending === "save" ? wikiUi.saving : wikiUi.save)}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary review-button"
            disabled={!model.hydrated || Boolean(model.pending)}
            onClick={onReview}
          >
            {t(canPublish ? wikiUi.reviewPublish : wikiUi.review)}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
