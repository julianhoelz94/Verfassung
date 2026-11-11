import {
  createContext,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { DocumentAttachmentTemplate } from "../../../../apps/gateway-web/app/components/documents/DocumentAttachmentTemplate";
import { useTranslation } from "../../../../apps/gateway-web/app/components/TranslationProvider";
import type {
  DocumentLink,
  DocumentRecord,
  DocumentRevision,
} from "../../../../apps/gateway-web/lib/document-api";
import { documents as initial, document, folders } from "./sample";
import styles from "./preview.module.css";

function pin(record: DocumentRecord, note: string): DocumentLink {
  return {
    documentId: record.id,
    revisionId: record.revision.id,
    citationNote: note,
    document: record,
  };
}
const Library = createContext<{
  library: DocumentRecord[];
  setLibrary: Dispatch<SetStateAction<DocumentRecord[]>>;
} | null>(null);
export function EvidenceLibrary({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState(initial);
  return (
    <Library.Provider value={{ library, setLibrary }}>
      {children}
    </Library.Provider>
  );
}
export function Evidence({
  onInspect,
  context,
}: {
  onInspect: (document: DocumentRecord) => void;
  context: "constitution" | "setup_proposal";
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const shared = useContext(Library);
  if (!shared) throw new Error("Evidence must use the shared mock library");
  const { library, setLibrary } = shared;
  const [query, setQuery] = useState("");
  const page = library.filter((record) =>
    `${record.revision.title} ${record.citationKey}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const [links, setLinks] = useState<DocumentLink[]>([
    pin(initial[0], "S. 1 · Titel, Verkündung und ursprüngliche Gliederung."),
  ]);
  const [revisions, setRevisions] = useState<
    Record<string, DocumentRevision[]>
  >({});
  const [note, setNote] = useState(""),
    [notice, setNotice] = useState("");
  const searchSequence = useRef(0);
  async function search(query: string) {
    const sequence = ++searchSequence.current;
    await Promise.resolve();
    if (sequence !== searchSequence.current) return false;
    setQuery(query);
    return true;
  }
  async function attach(id: string, revisionId: string) {
    const record = library.find((record) => record.id === id);
    const revision =
      revisions[id]?.find((revision) => revision.id === revisionId) ??
      record?.revision;
    if (!record || !revision) return false;
    setLinks((current) => [...current, pin({ ...record, revision }, note)]);
    setNotice(
      copy(
        "Document linked in this context. The cited revision is fixed.",
        "Dokument in diesem Kontext verknüpft. Die zitierte Revision bleibt fest.",
      ),
    );
    setNote("");
    return true;
  }
  return (
    <DocumentAttachmentTemplate
      heading={copy("Supplementary evidence", "Ergänzende Belege")}
      links={links}
      documents={page}
      revisions={revisions}
      folders={folders}
      documentTotal={page.length}
      canEdit
      canCreate
      pending={false}
      notice={notice}
      onSearch={search}
      onSelect={async (id) => {
        const record = library.find((record) => record.id === id);
        if (record)
          setRevisions((current) => ({
            ...current,
            [id]: [
              record.revision,
              { ...record.revision, id: `${id}-r1`, revision: 1 },
            ],
          }));
      }}
      contextFields={(mode) => (
        <details className={styles.note}>
          <summary>
            {copy(
              "Citation note / relevant passage",
              "Zitatnotiz / relevante Passage",
            )}
          </summary>
          <label>
            {context === "setup_proposal"
              ? copy("Note for this proposal", "Notiz zu diesem Vorschlag")
              : copy(
                  "Note for this constitution",
                  "Notiz zu dieser Verfassung",
                )}
            <textarea
              form={`setup-note-${context}-${mode}`}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <p className={styles.muted}>
            {copy(
              "This note belongs to this attachment, not the shared library record.",
              "Diese Notiz gehört zu dieser Verknüpfung, nicht zum gemeinsamen Bibliothekseintrag.",
            )}
          </p>
        </details>
      )}
      renderAttachmentContext={(link) =>
        link.citationNote ? (
          <p className={styles.citation}>{link.citationNote}</p>
        ) : null
      }
      onAttach={attach}
      onCreate={async (data) => {
        const record = document(
          `local-${library.length}`,
          String(data.get("title")),
          String(data.get("citationKey") || `Beleg${library.length + 1}`),
          String(data.get("issued") || "2026"),
        );
        const file = data.get("file");
        record.revision.fileName =
          file instanceof File && file.size ? file.name : null;
        record.revision.sourceUrl = String(data.get("sourceUrl") || "") || null;
        record.revision.description =
          String(data.get("description") || "") || null;
        record.revision.bibliography = JSON.parse(
          String(data.get("bibliography") || "{}"),
        );
        setLibrary((current) => [...current, record]);
        setLinks((current) => [...current, pin(record, note)]);
        setNote("");
        setNotice(
          copy(
            "Example document created and linked locally. No file was uploaded.",
            "Beispieldokument lokal angelegt und verknüpft. Es wurde keine Datei hochgeladen.",
          ),
        );
        return true;
      }}
      onDetach={async (id) => {
        setLinks((current) => current.filter((link) => link.documentId !== id));
        setNotice(
          copy(
            "Detached. The document remains in the library.",
            "Verknüpfung gelöst. Das Dokument bleibt in der Bibliothek.",
          ),
        );
        return true;
      }}
      onInspect={onInspect}
    />
  );
}
