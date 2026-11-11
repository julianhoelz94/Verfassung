"use client";

/* eslint-disable @next/next/no-img-element -- Immutable authenticated source thumbnails use their original image bytes. */

import { useId } from "react";
import type { WikiImage } from "../../../lib/api";
import type { DocumentLink } from "../../../lib/document-api";
import { wikiCitationIndex } from "../../../lib/wiki-document";
import { StagedDocumentPicker } from "../../components/documents/StagedDocumentPicker";
import { HelpTooltip } from "../../components/HelpTooltip";
import { useTranslation } from "../../components/TranslationProvider";
import { Info, Image as ImageIcon, X } from "lucide-react";
import type { WikiWorkspaceModel } from "./useWikiWorkspace";

export function WikiSourceFields({
  model,
  canEdit,
  canCreate,
}: {
  model: WikiWorkspaceModel;
  canEdit: boolean;
  canCreate: boolean;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const { draft } = model;
  function image(link: DocumentLink) {
    if (
      draft.citations.some(
        (ref) =>
          ref.documentId === link.documentId &&
          ref.revision !== link.document.revision.revision,
      )
    ) {
      model.setError(
        copy(
          "Use the same revision for this image and its document citation.",
          "Verwende für dieses Bild und seinen Dokumentbeleg dieselbe Revision.",
        ),
      );
      return false;
    }
    if (!draft.images.some((item) => item.documentId === link.documentId))
      model.update({
        images: [
          ...draft.images,
          {
            documentId: link.documentId,
            revision: link.document.revision.revision,
            alt: "",
            caption: "",
            placement: "after_body",
          },
        ],
      });
    return true;
  }
  return (
    <section className="sources-view">
      <div className="section-intro">
        <span className="eyebrow">
          {copy("SUPPORTING MATERIAL", "BEGLEITMATERIAL")}
        </span>
        <h2>{copy("Ground the story in sources", "Die Geschichte belegen")}</h2>
        <p>
          {copy(
            "Cite library documents and add images to this Wiki draft.",
            "Verknüpfe Bibliotheksdokumente und ergänze Bilder für diesen Wiki-Entwurf.",
          )}
        </p>
      </div>
      <div className="source-section">
        <div className="section-help">
          <p>
            {copy(
              "Citations use an exact document revision. Add inline page or passage references with Cite source in the text toolbar.",
              "Belege verwenden eine genaue Dokumentrevision. Seiten- oder Passagenbelege ergänzt du mit Quelle zitieren in der Textleiste.",
            )}
          </p>
          <HelpTooltip
            label={copy(
              "Selections are saved with the Wiki draft. Detaching keeps the document in the library.",
              "Die Auswahl wird mit dem Wiki-Entwurf gespeichert. Beim Lösen der Verknüpfung bleibt das Dokument in der Bibliothek.",
            )}
          >
            <Info size={15} />
          </HelpTooltip>
        </div>
        <StagedDocumentPicker
          name="citations"
          heading={copy("Document citations", "Dokumentbelege")}
          headingLevel="h3"
          canEdit={canEdit}
          canCreate={canCreate}
          references={draft.citations}
          onChoose={model.addSource}
          onChange={model.sources}
          onDetach={model.removeSource}
          onLinksChange={model.rememberLinks}
          onPendingChange={model.setSourcePending}
        />
      </div>
      <div className="source-section image-section">
        <div className="subsection-heading">
          <ImageIcon size={18} />
          <h3>{copy("Images", "Bilder")}</h3>
          <span className="subtle-count">{draft.images.length}</span>
        </div>
        {draft.images.map((item, index) => (
          <WikiImageCard
            key={item.documentId}
            image={item}
            index={index}
            model={model}
            canEdit={canEdit}
          />
        ))}
        {canEdit ? (
          <StagedDocumentPicker
            kind="image"
            headingLevel="h3"
            heading={copy("Add an image", "Bild hinzufügen")}
            canCreate={canCreate}
            onChoose={image}
            onPendingChange={model.setImagePending}
          />
        ) : null}
      </div>
      <details className="secondary-details external-links">
        <summary>
          {copy("Additional external links", "Weitere externe Links")}
        </summary>
        <label className="plain-field">
          {copy("One URL per line", "Eine URL pro Zeile")}
          <textarea
            name="sourceUrls"
            rows={3}
            value={draft.sourceUrls}
            disabled={!canEdit}
            onChange={(event) =>
              model.update({ sourceUrls: event.target.value })
            }
          />
          <small>
            {copy(
              "For supplementary websites. Use document citations for source documents.",
              "Für ergänzende Websites. Verwende Dokumentbelege für Quelldokumente.",
            )}
          </small>
        </label>
      </details>
    </section>
  );
}

function WikiImageCard({
  image,
  index,
  model,
  canEdit,
}: {
  image: WikiImage;
  index: number;
  model: WikiWorkspaceModel;
  canEdit: boolean;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const altId = useId();
  const cited = wikiCitationIndex(model.draft.bodyDocument).references.some(
    (ref) => ref.documentId === image.documentId,
  );
  function update(patch: Partial<WikiImage>) {
    model.update({
      images: model.draft.images.map((item) =>
        item.documentId === image.documentId ? { ...item, ...patch } : item,
      ),
    });
  }
  function reorder(to: number) {
    const images = [...model.draft.images];
    images.splice(index, 1);
    images.splice(to, 0, image);
    model.update({ images });
  }
  return (
    <article className="image-card">
      <div className="image-card-heading">
        <div className="image-thumbnail">
          {/* The authenticated preview reads the exact image pin. */}
          <img
            src={`/editor/documents/${image.documentId}/revisions/${image.revision}/file`}
            alt=""
            loading="lazy"
          />
        </div>
        <div>
          <h4>
            {image.caption || copy(`Picture ${index + 1}`, `Bild ${index + 1}`)}
          </h4>
          <span>
            {copy("Revision", "Revision")} {image.revision}
          </span>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="icon-button"
            aria-label={`${copy("Remove image", "Bild entfernen")}: ${index + 1}`}
            onClick={() =>
              model.update({
                images: model.draft.images.filter(
                  (item) => item.documentId !== image.documentId,
                ),
              })
            }
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="plain-field">
        <label htmlFor={altId}>
          {copy("Alternative text", "Alternativtext")}
          <span className="required-marker" aria-hidden="true" />
        </label>
        <input
          id={altId}
          aria-describedby={`${altId}-help`}
          name={`alt-${image.documentId}`}
          required
          maxLength={500}
          disabled={!canEdit}
          value={image.alt}
          onChange={(event) => update({ alt: event.target.value })}
          placeholder={copy(
            "Describe what the image shows",
            "Beschreibe, was das Bild zeigt",
          )}
        />
        <small id={`${altId}-help`}>
          {copy(
            "Describe the content for readers who cannot see the image.",
            "Beschreibe den Inhalt für Lesende, die das Bild nicht sehen können.",
          )}
        </small>
      </div>
      <details className="secondary-details">
        <summary>
          {copy(
            "Caption, credit & placement",
            "Bildunterschrift, Nachweis & Platzierung",
          )}
        </summary>
        <div className="image-metadata">
          {(["caption", "credit", "rights", "sourceUrl"] as const).map(
            (field) => (
              <label className="plain-field" key={field}>
                {imageFieldLabel(field, copy)}
                <input
                  name={`${field === "sourceUrl" ? "source" : field}-${image.documentId}`}
                  type={field === "sourceUrl" ? "url" : "text"}
                  maxLength={
                    field === "caption"
                      ? 1000
                      : field === "sourceUrl"
                        ? 2048
                        : 500
                  }
                  disabled={!canEdit}
                  value={image[field] ?? ""}
                  onChange={(event) => update({ [field]: event.target.value })}
                />
              </label>
            ),
          )}
          <label className="plain-field">
            {copy("Placement", "Platzierung")}
            <select
              aria-label={copy("Placement", "Platzierung")}
              name={`placement-${image.documentId}`}
              value={image.placement ?? "after_body"}
              disabled={!canEdit}
              onChange={(event) =>
                update({
                  placement: event.target.value as WikiImage["placement"],
                })
              }
            >
              <option value="before_body">
                {copy("Before text", "Vor dem Text")}
              </option>
              <option value="after_body">
                {copy("After text", "Nach dem Text")}
              </option>
            </select>
          </label>
          <label className="plain-field">
            {copy("Position", "Position")}
            <select
              aria-label={copy("Position", "Position")}
              name={`order-${image.documentId}`}
              value={index + 1}
              disabled={!canEdit}
              onChange={(event) => reorder(Number(event.target.value) - 1)}
            >
              {model.draft.images.map((_, position) => (
                <option value={position + 1} key={position}>
                  {position + 1}
                </option>
              ))}
            </select>
          </label>
          {canEdit ? (
            <label className="plain-field full-span">
              {copy("Replace image file", "Bilddatei ersetzen")}
              <input
                type="file"
                name={`replace-${image.documentId}`}
                disabled={cited}
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              />
              {cited ? (
                <small>
                  {copy(
                    "This exact image revision is cited in the text. Remove those citations before replacing its file.",
                    "Diese genaue Bildrevision wird im Text zitiert. Entferne diese Belege, bevor du die Datei ersetzt.",
                  )}
                </small>
              ) : null}
            </label>
          ) : null}
        </div>
      </details>
    </article>
  );
}
function imageFieldLabel(
  field: string,
  copy: (en: string, de: string) => string,
) {
  const labels: Record<string, string> = {
    caption: copy("Caption", "Bildunterschrift"),
    credit: copy("Credit", "Bildnachweis"),
    rights: copy("Rights", "Nutzungsrechte"),
    sourceUrl: copy("Source URL", "Quell-URL"),
  };
  return labels[field];
}
