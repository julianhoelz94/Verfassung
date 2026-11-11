"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, Check, FileText, Globe } from "lucide-react";
import type { WikiPageRevision } from "../../../lib/api";
import { wikiChanges, wikiDraftIssue } from "../../../lib/wiki-draft";
import { useTranslation } from "../../components/TranslationProvider";
import { WikiContent } from "../../components/WikiContent";
import { WikiPanel } from "../../components/WikiPanel";
import type { WikiWorkspaceModel } from "./useWikiWorkspace";
import { wikiUi } from "./wiki-messages";

export function WikiViewerPreview({
  page,
  ownerName,
  onClose,
  onEdit,
  canEdit,
}: {
  canEdit: boolean;
  page: WikiPageRevision;
  ownerName: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useTranslation(),
    id = useId();
  return (
    <div className="viewer-frame" data-wiki-viewer>
      <WikiPanel
        id={`wiki-viewer-${id}`}
        title={`${t({ en: "About", de: "Über" })} ${ownerName}`}
        onClose={onClose}
        actions={
          <button type="button" className="text-button" onClick={onEdit}>
            {t(
              canEdit
                ? { en: "Edit Wiki", de: "Wiki bearbeiten" }
                : { en: "Review Wiki", de: "Wiki prüfen" },
            )}
          </button>
        }
      >
        <WikiContent page={page} preview />
      </WikiPanel>
    </div>
  );
}
export function WikiDialog({
  title,
  children,
  close,
  wide = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    t = useTranslation();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`wiki-dialog ${wide ? "wide" : ""}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t({ en: "Close", de: "Schließen" })}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function WikiPublicationReview({
  model,
  ownerName,
  canEdit,
  canPublish,
  close,
  onEdit,
}: {
  model: WikiWorkspaceModel;
  ownerName: string;
  canEdit: boolean;
  canPublish: boolean;
  close: () => void;
  onEdit: () => void;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const changes = wikiChanges(model.draft, model.published),
    issue = wikiDraftIssue(model.draft);
  const page = {
    ...model.saved,
    ...model.draft,
    sourceUrls: model.draft.sourceUrls
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
  } as WikiPageRevision;
  return (
    <WikiDialog
      title={copy(
        "Review before publishing",
        "Vor der Veröffentlichung prüfen",
      )}
      close={close}
    >
      <div className="review-layout">
        <section className="review-summary">
          <span className="eyebrow">
            {copy("PUBLICATION", "VERÖFFENTLICHUNG")}
          </span>
          <h3>{copy("Ready for your readers?", "Bereit für die Lesenden?")}</h3>
          <p>
            {copy(
              "Publish the saved Wiki independently of constitutional text and legal versions.",
              "Veröffentliche das gespeicherte Wiki unabhängig vom Verfassungstext und den Rechtsfassungen.",
            )}
          </p>
          <h4>
            {copy(
              "Changes since publication",
              "Änderungen seit der Veröffentlichung",
            )}
          </h4>
          <ul className="review-checklist">
            {[
              ...new Set(
                changes.map((key) => (key === "bodyDocument" ? "body" : key)),
              ),
            ].map((key) => (
              <li key={key}>
                <Check size={15} />
                {changeLabel(key, copy)}
              </li>
            ))}
            {!changes.length ? (
              <li>
                {copy(
                  "No unpublished changes",
                  "Keine unveröffentlichten Änderungen",
                )}
              </li>
            ) : null}
          </ul>
          <div className="revision-pins">
            <FileText size={17} />
            <div>
              <strong>
                {model.draft.citations.length}{" "}
                {copy("document citations", "Dokumentbelege")}
              </strong>
              <span>
                {copy(
                  "Exact revisions remain pinned.",
                  "Genaue Revisionen bleiben fest verknüpft.",
                )}
              </span>
            </div>
          </div>
          {model.error ? (
            <p className="wiki-error" role="alert">
              {model.error}
            </p>
          ) : null}
          {issue ? (
            <p className="review-warning">{t(wikiUi[`${issue}Error`])}</p>
          ) : null}
          {model.dirty ? (
            <div className="review-warning">
              <strong>
                {copy(
                  "Save your latest changes first",
                  "Zuerst die neuesten Änderungen speichern",
                )}
              </strong>
              <p>
                {copy(
                  "Publication uses a saved draft. Your current edits have not been saved yet.",
                  "Die Veröffentlichung verwendet einen gespeicherten Entwurf. Deine aktuellen Änderungen sind noch nicht gespeichert.",
                )}
              </p>
              {canEdit ? (
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(model.pending) || model.documentPending}
                  onClick={() => void model.save()}
                >
                  {t(wikiUi.save)}
                </button>
              ) : null}
            </div>
          ) : null}
          {!canPublish ? (
            <p>
              {copy(
                "A publisher can publish this draft.",
                "Ein Nutzer mit Veröffentlichungsrecht kann diesen Entwurf veröffentlichen.",
              )}
            </p>
          ) : null}
        </section>
        <div className="review-page">
          <WikiViewerPreview
            page={page}
            ownerName={ownerName}
            onClose={close}
            canEdit={canEdit}
            onEdit={onEdit}
          />
        </div>
      </div>
      <footer className="dialog-actions">
        <button type="button" className="btn" onClick={close}>
          {copy("Back to editing", "Zurück zur Bearbeitung")}
        </button>
        {canPublish ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              model.dirty ||
              Boolean(model.pending) ||
              model.documentPending ||
              Boolean(issue) ||
              !model.saved ||
              model.saved.id === model.published?.id
            }
            onClick={async () => {
              if (await model.publish()) close();
            }}
          >
            <Globe size={16} />
            {t(
              model.pending === "publish" ? wikiUi.publishing : wikiUi.publish,
            )}
          </button>
        ) : null}
      </footer>
    </WikiDialog>
  );
}
function changeLabel(key: string, copy: (en: string, de: string) => string) {
  const labels: Record<string, string> = {
    summary: copy("Short description", "Kurzbeschreibung"),
    body: copy("Page text and formatting", "Seitentext und Formatierung"),
    images: copy("Images and descriptions", "Bilder und Beschreibungen"),
    citations: copy("Document citations", "Dokumentbelege"),
    sourceUrls: copy("External links", "Externe Links"),
  };
  return labels[key];
}
