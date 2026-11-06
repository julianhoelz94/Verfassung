import { randomUUID } from "node:crypto";
import {
  type MaterialTarget,
  type DocumentLink,
} from "../../../lib/document-api";
import { T } from "../TranslationProvider";
import { DocumentLinks } from "../../editor/documents/DocumentLinks";
import { currentLocale } from "../../../lib/server-locale";
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
  const locale = await currentLocale();
  return (
    <section className={styles.materials} data-material-target={target.targetType} data-material-scope={target.scope}>
      <DocumentLinks
        targetType={target.targetType} targetId={target.targetId} scopeRevisionId={target.scope}
        canEdit={editable} returnTo={target.returnTo}
        heading={compact ? (locale === 'de' ? 'Zu dieser Änderung' : 'About this change') : (locale === 'de' ? 'Kommentare & Materialien' : 'Commentary & materials')} headingLevel={compact ? 'h3' : 'h2'}
      />
      {editable ? <details><summary><T value={{en:'Add commentary',de:'Kommentar hinzufügen'}} /></summary>
        <form action="/api/record-materials" method="post" className={styles.materialForm}>
          <TargetFields {...target} />
          <input type="hidden" name="operationId" value={randomUUID()} />
          <MaterialFields />
          <p><T value={{en:'This commentary becomes public when saved. Use the document controls above to upload or choose a source.',de:'Dieser Kommentar wird beim Speichern öffentlich. Mit den Dokumentfunktionen oben kannst du eine Quelle hochladen oder auswählen.'}} /></p>
          <button><T value={{en:'Save and publish material',de:'Material speichern und veröffentlichen'}} /></button>
        </form>
      </details> : null}
    </section>
  );
}
