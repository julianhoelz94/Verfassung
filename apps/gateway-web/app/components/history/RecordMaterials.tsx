import { randomUUID } from "node:crypto";
import {
  listDocumentLinks,
  type MaterialTarget,
  type DocumentLink,
} from "../../../lib/document-api";
import { T } from "../TranslationProvider";
import { FormattedDate } from "../../../lib/format-date";
import styles from "./ConstitutionHistory.module.css";

type Target = {
  targetType: MaterialTarget;
  targetId: string;
  scope?: string;
  returnTo: string;
};
function TargetFields({ targetType, targetId, scope, returnTo }: Target) {
  return (
    <>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="scope" value={scope ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}
function MaterialFields({ link }: { link?: DocumentLink }) {
  return (
    <>
      <label>
        <T value={{ en: "Title", de: "Titel" }} />
        <input
          name="title"
          required
          maxLength={500}
          defaultValue={link?.document.revision.title}
        />
      </label>
      <label>
        <T value={{ en: "Commentary", de: "Kommentar" }} />
        <textarea
          name="description"
          maxLength={10000}
          defaultValue={link?.document.revision.description ?? ""}
        />
      </label>
      <label>
        <T
          value={{ en: "Source URL (optional)", de: "Quellen-URL (optional)" }}
        />
        <input
          name="sourceUrl"
          type="url"
          maxLength={2048}
          defaultValue={link?.document.revision.sourceUrl ?? ""}
        />
      </label>
    </>
  );
}
export async function RecordMaterials({
  editable,
  compact = false,
  ...target
}: Target & { editable: boolean; compact?: boolean }) {
  const Heading = compact ? "h3" : "h2",
    ItemHeading = compact ? "h4" : "h3";
  const links = await listDocumentLinks(
    target.targetType,
    target.targetId,
    target.scope,
  ).catch(() => null);
  return (
    <section
      className={styles.materials}
      data-material-target={target.targetType}
      data-material-scope={target.scope}
    >
      <Heading>
        <T
          value={
            compact
              ? { en: "About this change", de: "Zu dieser Änderung" }
              : { en: "Commentary & materials", de: "Kommentare & Materialien" }
          }
        />
      </Heading>
      {links === null ? (
        <p role="status">
          <T
            value={{
              en: "Materials are temporarily unavailable.",
              de: "Materialien sind vorübergehend nicht verfügbar.",
            }}
          />
        </p>
      ) : null}
      {links?.map((link) => (
        <article key={link.documentId}>
          <ItemHeading>{link.document.revision.title}</ItemHeading>
          <p>{link.document.revision.description}</p>
          <small>
            <T value={{ en: "Added", de: "Hinzugefügt" }} />{" "}
            <FormattedDate value={link.document.revision.createdAt} /> ·{" "}
            <T value={{ en: "Contributor", de: "Mitwirkende Person" }} />{" "}
            {link.document.revision.createdBy.slice(0, 8)}
          </small>
          {link.document.revision.sourceUrl ? (
            <p>
              <a href={link.document.revision.sourceUrl}>
                <T value={{ en: "Open source", de: "Quelle öffnen" }} /> ↗
              </a>
            </p>
          ) : null}
          {link.document.revision.fileName ? (
            <p>
              <a
                href={`/documents/${link.documentId}?revision=${link.document.revision.revision}`}
              >
                {link.document.revision.fileName}
              </a>
            </p>
          ) : null}
          {editable ? (
            <details>
              <summary>
                <T
                  value={{
                    en: "Edit or remove",
                    de: "Bearbeiten oder entfernen",
                  }}
                />
              </summary>
              <form
                action="/api/record-materials"
                method="post"
                className={styles.materialForm}
              >
                <TargetFields {...target} />
                <input type="hidden" name="action" value="edit" />
                <input
                  type="hidden"
                  name="documentId"
                  value={link.documentId}
                />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={link.document.revision.revision}
                />
                <input
                  type="hidden"
                  name="expectedLinkedRevisionId"
                  value={link.revisionId ?? ""}
                />
                <MaterialFields link={link} />
                <button>
                  <T
                    value={{
                      en: "Save and publish changes",
                      de: "Änderungen speichern und veröffentlichen",
                    }}
                  />
                </button>
              </form>
              <form action="/api/record-materials" method="post">
                <TargetFields {...target} />
                <input type="hidden" name="action" value="remove" />
                <input
                  type="hidden"
                  name="documentId"
                  value={link.documentId}
                />
                <p>
                  <T
                    value={{
                      en: "Remove this material from the public record? Its revision history is retained.",
                      de: "Dieses Material aus dem öffentlichen Eintrag entfernen? Der Änderungsverlauf bleibt erhalten.",
                    }}
                  />
                </p>
                <button>
                  <T
                    value={{ en: "Remove material", de: "Material entfernen" }}
                  />
                </button>
              </form>
            </details>
          ) : null}
        </article>
      ))}
      {!links?.length && links !== null ? (
        <p>
          <T
            value={{
              en: "No additional materials yet.",
              de: "Noch keine zusätzlichen Materialien.",
            }}
          />
        </p>
      ) : null}
      {editable ? (
        <details>
          <summary>
            <T
              value={{
                en: "Add commentary or material",
                de: "Kommentar oder Material hinzufügen",
              }}
            />
          </summary>
          <form
            action="/api/record-materials"
            method="post"
            encType="multipart/form-data"
            className={styles.materialForm}
          >
            <TargetFields {...target} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <MaterialFields />
            <label>
              <T
                value={{
                  en: "File (optional, up to 20 MB)",
                  de: "Datei (optional, bis zu 20 MB)",
                }}
              />
              <input
                type="file"
                name="file"
                accept="application/pdf,text/plain,image/jpeg,image/png,image/webp"
              />
            </label>
            <p>
              <T
                value={{
                  en: "This material will be public when saved. Add commentary, a source URL, or a file.",
                  de: "Dieses Material wird beim Speichern öffentlich. Ergänzen Sie einen Kommentar, eine Quellen-URL oder eine Datei.",
                }}
              />
            </p>
            <button>
              <T
                value={{
                  en: "Save and publish material",
                  de: "Material speichern und veröffentlichen",
                }}
              />
            </button>
          </form>
        </details>
      ) : null}
    </section>
  );
}
