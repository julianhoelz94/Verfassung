"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  WikiCitation,
  WikiInlineReference as InlineCitation,
} from "../../../lib/wiki-document";
import { StagedDocumentPicker } from "../../components/documents/StagedDocumentPicker";

export function WikiCitationComposer({
  open,
  editing,
  citations,
  canCreate,
  onPendingChange,
  onConfirm,
  onRemove,
  onClose,
  copy,
}: {
  open: boolean;
  editing: InlineCitation | null;
  citations: WikiCitation[];
  canCreate: boolean;
  onPendingChange: (pending: boolean) => void;
  onConfirm: (link: WikiCitation, locator: string) => boolean;
  onRemove: () => void;
  onClose: () => void;
  copy: (en: string, de: string) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    headingId = useId(),
    locatorId = useId();
  const [selection, setSelection] = useState<WikiCitation | null>(null),
    [locator, setLocator] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (open) {
        setError("");
        if (editing) {
          setSelection(
            citations.find(
              (item) =>
                item.documentId === editing.documentId &&
                item.revision === editing.revision,
            ) || {
              documentId: editing.documentId,
              revision: editing.revision,
              title: editing.documentId,
            },
          );
          setLocator(editing.locator);
        }
        dialog.current?.showModal();
      } else dialog.current?.close();
    });
    return () => {
      active = false;
    };
  }, [open, editing, citations]);
  const select = (link: WikiCitation) => {
    setSelection(link);
    setError("");
    return true;
  };
  return (
    <dialog
      ref={dialog}
      className="wiki-dialog citation-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="dialog-heading">
        <h2 id={headingId}>
          {editing
            ? copy("Edit citation", "Beleg bearbeiten")
            : copy("Cite a source", "Quelle zitieren")}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={copy("Close citation dialog", "Belegdialog schließen")}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="citation-composer-body">
        <p className="citation-intro">
          {copy(
            "Choose a source, then add an optional page or passage. The reference is inserted at your cursor.",
            "Wähle eine Quelle und ergänze bei Bedarf eine Seite oder Passage. Der Beleg wird an der Cursorposition eingefügt.",
          )}
        </p>
        {citations.length ? (
          <section className="linked-citation-sources">
            <h3>
              {copy(
                "Already linked to this Wiki",
                "Bereits mit diesem Wiki verknüpft",
              )}
            </h3>
            <div>
              {citations.map((link) => (
                <button
                  key={link.documentId}
                  type="button"
                  className="linked-source-choice"
                  aria-pressed={
                    selection?.revision === link.revision &&
                    selection?.documentId === link.documentId
                  }
                  onClick={() => select(link)}
                >
                  <span className="source-choice-mark">
                    {selection?.revision === link.revision &&
                    selection?.documentId === link.documentId
                      ? "✓"
                      : "+"}
                  </span>
                  <span>
                    <strong>{link.title}</strong>
                    <small>
                      {copy("Revision", "Revision")} {link.revision}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <details className="secondary-details citation-library">
          <summary>
            {copy(
              "Choose another document or upload a source",
              "Anderes Dokument auswählen oder Quelle hochladen",
            )}
          </summary>
          <StagedDocumentPicker
            heading={copy("Source library", "Quellenbibliothek")}
            headingLevel="h3"
            canCreate={canCreate}
            onPendingChange={onPendingChange}
            onChoose={(link) =>
              select({
                documentId: link.documentId,
                revision: link.document.revision.revision,
                title: link.document.revision.title,
              })
            }
          />
        </details>
        <div className="chosen-citation" aria-live="polite">
          {selection ? (
            <>
              <span className="eyebrow">
                {copy("SELECTED SOURCE", "AUSGEWÄHLTE QUELLE")}
              </span>
              <strong>{selection.title}</strong>
              <span>
                {copy("Revision", "Revision")} {selection.revision}
              </span>
            </>
          ) : (
            <span>
              {copy(
                "Select a source to continue.",
                "Wähle eine Quelle aus, um fortzufahren.",
              )}
            </span>
          )}
        </div>
        <label className="plain-field" htmlFor={locatorId}>
          {copy("Page / passage (optional)", "Seite / Passage (optional)")}
          <input
            id={locatorId}
            value={locator}
            maxLength={4000}
            onChange={(event) => setLocator(event.target.value)}
            placeholder={copy(
              "e.g. p. 12; Article 1(1)",
              "z. B. S. 12; Artikel 1 Abs. 1",
            )}
          />
        </label>
        <p className="citation-pin-note">
          {copy(
            "The citation keeps this exact document revision. Numbering follows its position in the text.",
            "Der Beleg behält diese genaue Dokumentrevision. Die Nummerierung folgt seiner Position im Text.",
          )}
        </p>
        {error ? (
          <p className="citation-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <footer className="dialog-actions">
        <div>
          {editing ? (
            <button
              type="button"
              className="text-button citation-remove"
              onClick={onRemove}
            >
              {copy("Remove citation", "Beleg entfernen")}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              {copy("Cancel", "Abbrechen")}
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selection}
          onClick={() => {
            if (selection && !onConfirm(selection, locator.trim()))
              setError(
                copy(
                  "A different revision of this source is already in use. Use the same revision for this Wiki’s citations and image.",
                  "Eine andere Revision dieser Quelle wird bereits verwendet. Verwende für Belege und Bild dieses Wikis dieselbe Revision.",
                ),
              );
          }}
        >
          {editing
            ? copy("Update citation", "Beleg aktualisieren")
            : copy("Insert citation", "Beleg einfügen")}
        </button>
      </footer>
    </dialog>
  );
}
