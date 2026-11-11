"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WikiPageRevision } from "../../../lib/api";
import type { DocumentLink } from "../../../lib/document-api";
import type { DocumentReference } from "../../../lib/document-reference";
import {
  hasWikiPinConflict,
  wikiCommandData,
  wikiDraft,
  wikiDraftIssue,
  type WikiDraft,
} from "../../../lib/wiki-draft";
import {
  legacyWikiDocument,
  readWikiDocument,
  wikiCitationIndex,
  type WikiCitation,
  type WikiWritingValue,
} from "../../../lib/wiki-document";
import type { WikiOwner } from "../../../lib/wiki-routing";
import type { WikiCommand } from "../../../lib/wiki-workspace";
import { useTranslation } from "../../components/TranslationProvider";
import { useHydrated } from "../../../lib/use-hydrated";
import { wikiUi } from "./wiki-messages";

type Inputs = {
  owner: WikiOwner;
  actorId: string;
  initialDraft: WikiPageRevision | null;
  initialPublished: WikiPageRevision | null;
  history: WikiPageRevision[];
  historyPage: number;
  returnTo?: string;
  saveAction: WikiCommand;
  publishAction: WikiCommand;
  canEdit?: boolean;
  initialMessage?: "saved" | "published" | "error";
};
export type Retained = { base: string | null; draft: WikiDraft };
function readRetention(key: string): Retained | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? "null",
    ) as Retained | null;
    if (stored?.draft && typeof stored.draft.body === "string") {
      try {
        readWikiDocument(stored.draft.bodyDocument);
      } catch {
        stored.draft.bodyDocument = legacyWikiDocument(stored.draft.body);
      }
    }
    return stored;
  } catch {
    return null;
  }
}

export function useWikiWorkspace(props: Inputs) {
  const t = useTranslation(),
    hydrated = useHydrated(),
    form = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(props.initialDraft),
    [published, setPublished] = useState(props.initialPublished);
  const [draft, setDraft] = useState<WikiDraft>(() =>
    wikiDraft(props.initialDraft ?? props.initialPublished),
  );
  const [history, setHistory] = useState(props.history),
    [pending, setPending] = useState<"save" | "publish" | null>(null);
  const [notice, setNotice] = useState(
      props.initialMessage === "saved"
        ? t(wikiUi.saved)
        : props.initialMessage === "published"
          ? t(wikiUi.published)
          : "",
    ),
    [error, setError] = useState(
      props.initialMessage === "error" ? t(wikiUi.saveError) : "",
    ),
    [recovery, setRecovery] = useState<WikiDraft | null>(null);
  const [fileDirty, setFileDirty] = useState(false);
  const [retentionLoaded, setRetentionLoaded] = useState(false);
  const [writerKey, setWriterKey] = useState(0),
    [retained, setRetained] = useState(false),
    [documentPending, setDocumentPending] = useState(false);
  const operation = useRef({ key: "", id: "" }),
    busy = useRef(false);
  const pendingDocuments = useRef(new Set<string>());
  const markDocumentPending = useCallback(
    (channel: string, active: boolean) => {
      if (active) pendingDocuments.current.add(channel);
      else pendingDocuments.current.delete(channel);
      setDocumentPending(pendingDocuments.current.size > 0);
    },
    [],
  );
  const setSourcePending = useCallback(
    (active: boolean) => markDocumentPending("sources", active),
    [markDocumentPending],
  );
  const setImagePending = useCallback(
    (active: boolean) => markDocumentPending("images", active),
    [markDocumentPending],
  );
  const setCitationPending = useCallback(
    (active: boolean) => markDocumentPending("citation", active),
    [markDocumentPending],
  );
  const titles = useRef(
    new Map(
      (props.initialDraft?.citations ?? []).map((item) => [
        `${item.documentId}:${item.revision}`,
        item.title,
      ]),
    ),
  );
  const key = `atlas:wiki:${props.actorId}:${props.owner.targetType}:${props.owner.targetId}`;
  const dirty =
    fileDirty ||
    JSON.stringify(draft) !== JSON.stringify(wikiDraft(saved ?? published));
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = props.canEdit === false ? null : readRetention(key);
      if (
        stored?.draft &&
        typeof stored.draft.body === "string" &&
        typeof stored.draft.sourceUrls === "string" &&
        typeof stored.draft.summary === "string" &&
        Array.isArray(stored.draft.images) &&
        Array.isArray(stored.draft.citations)
      ) {
        if (stored.base === (props.initialDraft?.id ?? null)) {
          setDraft(stored.draft);
          setWriterKey((value) => value + 1);
        } else setRecovery(stored.draft);
      }
      setRetentionLoaded(true);
    });
    return () => {
      active = false;
    };
    // This owner/base belongs to the mounted workspace, independently of task/pane changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!retentionLoaded || props.canEdit === false) return;
    try {
      if (dirty)
        localStorage.setItem(
          key,
          JSON.stringify({ base: saved?.id ?? null, draft }),
        );
      else if (!recovery) localStorage.removeItem(key);
      queueMicrotask(() => setRetained(true));
    } catch {
      queueMicrotask(() => setRetained(false));
    }
  }, [draft, dirty, saved, key, recovery, retentionLoaded, props.canEdit]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (fileDirty || documentPending || (dirty && !retained)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, retained, fileDirty, documentPending]);
  const update = useCallback((patch: Partial<WikiDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
    setNotice("");
  }, []);
  const rememberLinks = useCallback((links: DocumentLink[]) => {
    for (const link of links)
      titles.current.set(
        `${link.documentId}:${link.document.revision.revision}`,
        link.document.revision.title,
      );
  }, []);
  function writing(value: WikiWritingValue) {
    let bodyDocument = value.bodyDocument;
    // Keep over-limit working text editable; validation must never discard the draft.
    try {
      bodyDocument = readWikiDocument(bodyDocument);
    } catch {
      /* Save displays the validation issue. */
    }
    setDraft((current) => {
      const refs = new Map(
        wikiCitationIndex(value.bodyDocument).references.map((ref) => [
          ref.documentId,
          ref,
        ]),
      );
      const citations = current.citations.map((citation) => {
        const ref = refs.get(citation.documentId);
        refs.delete(citation.documentId);
        return ref
          ? {
              ...citation,
              revision: ref.revision,
              title:
                titles.current.get(`${ref.documentId}:${ref.revision}`) ??
                citation.title,
            }
          : citation;
      });
      for (const ref of refs.values())
        citations.push({
          documentId: ref.documentId,
          revision: ref.revision,
          title:
            titles.current.get(`${ref.documentId}:${ref.revision}`) ??
            ref.documentId,
        });
      return {
        ...current,
        ...value,
        bodyDocument,
        citations,
      };
    });
    setError("");
    setNotice("");
  }
  function addCitation(citation: WikiCitation, editingId?: string) {
    if (
      hasWikiPinConflict(
        draft,
        citation.documentId,
        citation.revision,
        editingId,
      )
    ) {
      setError(t(wikiUi.pinsError));
      return false;
    }
    titles.current.set(
      `${citation.documentId}:${citation.revision}`,
      citation.title,
    );
    update({
      citations: [
        ...draft.citations.filter(
          (item) => item.documentId !== citation.documentId,
        ),
        {
          ...draft.citations.find(
            (item) => item.documentId === citation.documentId,
          ),
          ...citation,
        },
      ],
    });
    return true;
  }
  function addSource(link: DocumentLink) {
    rememberLinks([link]);
    return addCitation({
      documentId: link.documentId,
      revision: link.document.revision.revision,
      title: link.document.revision.title,
      citationNote: link.citationNote || undefined,
    });
  }
  function removeSource(documentId: string) {
    if (
      wikiCitationIndex(draft.bodyDocument).references.some(
        (ref) => ref.documentId === documentId,
      )
    ) {
      setError(t(wikiUi.detachCited));
      return false;
    }
    return true;
  }
  function sources(references: DocumentReference[]) {
    update({
      citations: references.map((ref) => ({
        ...ref,
        title:
          titles.current.get(`${ref.documentId}:${ref.revision}`) ??
          draft.citations.find((item) => item.documentId === ref.documentId)
            ?.title ??
          ref.documentId,
      })),
    });
  }
  async function run(kind: "save" | "publish"): Promise<boolean> {
    if (busy.current || !form.current || !hydrated || documentPending)
      return false;
    if (kind === "publish" && (dirty || !saved || saved.id === published?.id))
      return false;
    const issue = wikiDraftIssue(draft);
    if (kind === "save" && issue) {
      setError(t(wikiUi[`${issue}Error`]));
      return false;
    }
    const data = wikiCommandData(
      form.current,
      props.owner,
      saved,
      draft,
      props.returnTo,
    );
    if (kind === "save") {
      operation.current = wikiSaveReceipt(data, operation.current);
      data.set("operationId", operation.current.id);
    }
    busy.current = true;
    setPending(kind);
    setError("");
    setNotice("");
    try {
      const result = await (
        kind === "save" ? props.saveAction : props.publishAction
      )(data);
      if (!result.ok) {
        setError(
          t(
            result.error === "documents"
              ? wikiUi.documentsError
              : kind === "save"
                ? wikiUi.saveError
                : wikiUi.publishError,
          ),
        );
        return false;
      }
      setSaved(result.page);
      setDraft(wikiDraft(result.page));
      if (kind === "publish") setPublished(result.page);
      if (props.historyPage === 0)
        setHistory((current) =>
          [
            result.page,
            ...current.filter((item) => item.id !== result.page.id),
          ].slice(0, 26),
        );
      finishWikiCommand(form.current);
      setFileDirty(false);
      setNotice(t(kind === "save" ? wikiUi.saved : wikiUi.published));
      operation.current = { key: "", id: "" };
      return true;
    } catch {
      setError(t(kind === "save" ? wikiUi.saveError : wikiUi.publishError));
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return {
    form,
    fileChanged: () =>
      setFileDirty(
        Array.from(
          form.current?.querySelectorAll<HTMLInputElement>(
            'input[type=file][name^="replace-"]',
          ) ?? [],
        ).some((input) => Boolean(input.files?.length)),
      ),
    draft,
    saved,
    published,
    history,
    dirty,
    pending,
    hydrated,
    retained,
    fileDirty,
    notice,
    error,
    recovery,
    writerKey,
    documentPending,
    setSourcePending,
    setImagePending,
    setCitationPending,
    update,
    writing,
    addCitation,
    addSource,
    removeSource,
    sources,
    rememberLinks,
    setError,
    save: () => run("save"),
    publish: () => run("publish"),
    recover: () => {
      if (recovery) {
        setDraft(recovery);
        setWriterKey((value) => value + 1);
        setRecovery(null);
      }
    },
    discardRecovery: () => {
      setRecovery(null);
      localStorage.removeItem(key);
    },
  };
}

export type WikiWorkspaceModel = Omit<
  ReturnType<typeof useWikiWorkspace>,
  "form"
>;

function wikiSaveReceipt(
  data: FormData,
  previous: { key: string; id: string },
) {
  const key = JSON.stringify(
    [...data.entries()].map(([name, value]) => [
      name,
      typeof value === "string"
        ? value
        : [value.name, value.size, value.lastModified],
    ]),
  );
  return previous.key === key ? previous : { key, id: crypto.randomUUID() };
}
function finishWikiCommand(form: HTMLFormElement) {
  form
    .querySelectorAll<HTMLInputElement>('input[type=file][name^="replace-"]')
    .forEach((input) => {
      input.value = "";
    });
  const url = new URL(window.location.href);
  for (const key of ["error", "saved", "published", "wikiStatus"])
    url.searchParams.delete(key);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
