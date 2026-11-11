import type { WikiImage, WikiPageRevision } from "./api";
import {
  mergeWikiReferences,
  readWikiDocument,
  wikiCitationIndex,
  type WikiCitation,
  type WikiWritingValue,
} from "./wiki-document";
import type { WikiOwner } from "./wiki-routing";

export type WikiDraft = WikiWritingValue & {
  summary: string;
  images: WikiImage[];
  citations: WikiCitation[];
  sourceUrls: string;
};
export function wikiDraft(page: WikiPageRevision | null): WikiDraft {
  return {
    summary: page?.summary ?? "",
    body: page?.body ?? "",
    bodyDocument: readWikiDocument(page?.bodyDocument),
    images: page?.images ?? [],
    citations: page?.citations ?? [],
    sourceUrls: (page?.sourceUrls ?? []).join("\n"),
  };
}
export function wikiChanges(
  draft: WikiDraft,
  published: WikiPageRevision | null,
) {
  const previous = wikiDraft(published);
  return (
    [
      "summary",
      "body",
      "bodyDocument",
      "images",
      "citations",
      "sourceUrls",
    ] as const
  ).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(previous[key]),
  );
}
export function wikiDraftIssue(
  draft: WikiDraft,
): "summary" | "text" | "images" | "pins" | "sources" | null {
  if (!draft.summary.trim() || draft.summary.length > 500) return "summary";
  try {
    readWikiDocument(draft.bodyDocument);
    if (draft.body.length > 20000) return "text";
  } catch {
    return "text";
  }
  if (
    draft.images.length > 30 ||
    draft.images.some((image) => !image.alt.trim() || image.alt.length > 500)
  )
    return "images";
  try {
    const pins = mergeWikiReferences(draft.citations, draft.bodyDocument);
    if (
      pins.some((pin) =>
        draft.images.some(
          (image) =>
            pin.documentId === image.documentId &&
            pin.revision !== image.revision,
        ),
      )
    )
      return "pins";
  } catch {
    return "pins";
  }
  const urls = draft.sourceUrls
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  if (
    urls.length > 20 ||
    urls.some((url) => !/^https?:\/\/\S+$/.test(url) || url.length > 2048)
  )
    return "sources";
  return null;
}
export function hasWikiPinConflict(
  draft: WikiDraft,
  documentId: string,
  revision: number,
  editingId?: string,
): boolean {
  return (
    draft.images.some(
      (image) => image.documentId === documentId && image.revision !== revision,
    ) ||
    wikiCitationIndex(draft.bodyDocument).references.some(
      (ref) =>
        ref.id !== editingId &&
        ref.documentId === documentId &&
        ref.revision !== revision,
    )
  );
}
export function wikiCommandData(
  form: HTMLFormElement,
  owner: WikiOwner,
  saved: WikiPageRevision | null,
  draft: WikiDraft,
  returnTo?: string,
) {
  const data = new FormData(form);
  data.set("targetType", owner.targetType);
  data.set("targetId", owner.targetId);
  data.set("code", owner.code ?? "");
  data.set("jurisdictionId", owner.jurisdictionId ?? "");
  data.set("expectedRevisionId", saved?.id ?? "");
  data.set("revisionId", saved?.id ?? "");
  data.set("summary", draft.summary);
  data.set("body", draft.body);
  data.set("bodyDocument", JSON.stringify(draft.bodyDocument ?? null));
  data.set("images", JSON.stringify(draft.images));
  data.set("sourceUrls", draft.sourceUrls);
  data.set(
    "citations",
    JSON.stringify(
      draft.citations.map(({ documentId, revision, citationNote }) => ({
        documentId,
        revision,
        ...(citationNote ? { citationNote } : {}),
      })),
    ),
  );
  if (returnTo) data.set("returnTo", returnTo);
  return data;
}
