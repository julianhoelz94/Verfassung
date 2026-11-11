"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  publishWikiPage,
  saveWikiDraft,
  type WikiImage,
  type WikiTargetType,
} from "../../../lib/api";
import { attachDocument, replaceDocumentFile } from "../../../lib/document-api";
import { requireSessionBearer } from "../../../lib/session";
import { resolveDocumentReferences } from "../../../lib/document-reference-server";
import { safeReturnTo } from "../../../lib/return-to";
import { wikiEditPath, wikiPublicPath } from "../../../lib/wiki-routing";
import { readDocumentReferences } from "../../../lib/document-reference";
import {
  mergeWikiReferences,
  readWikiDocument,
  wikiPlainBody,
  wikiCitationIndex,
} from "../../../lib/wiki-document";
import type { WikiCommandResult } from "../../../lib/wiki-workspace";

function target(form: FormData) {
  const targetType = String(form.get("targetType"));
  const targetId = String(form.get("targetId"));
  const code = String(form.get("code") ?? "");
  const jurisdictionId = String(form.get("jurisdictionId") ?? "");
  if (
    !["country", "constitution", "jurisdiction"].includes(targetType) ||
    !/^[0-9a-f-]{36}$/i.test(targetId) ||
    (code && !/^[A-Za-z]{2}$/.test(code)) ||
    (jurisdictionId && !/^[0-9a-f-]{36}$/i.test(jurisdictionId)) ||
    (targetType === "country" && !code) ||
    (targetType === "constitution" && !code && !jurisdictionId)
  ) {
    throw new Error("Invalid wiki target");
  }
  return {
    targetType: targetType as WikiTargetType,
    targetId,
    code,
    jurisdictionId,
  };
}

function editHref(
  targetType: string,
  targetId: string,
  code: string,
  status: string,
  form: FormData,
) {
  const returnTo = safeReturnTo(String(form.get("returnTo") ?? ""), "");
  if (returnTo) {
    const url = new URL(returnTo, "http://atlas.local");
    if (
      url.pathname === "/editor" &&
      url.searchParams.get("sessionId") &&
      url.searchParams.get("versionId")
    ) {
      url.searchParams.set("tab", "wiki");
      url.searchParams.set("wikiStatus", status);
      return url.pathname + url.search;
    }
  }
  return wikiEditPath(
    {
      targetType: targetType as WikiTargetType,
      targetId,
      code,
      jurisdictionId: String(form.get("jurisdictionId") ?? ""),
    },
    { [status]: "1" },
  );
}

/** Derive a separate stable receipt for each image in a retried Wiki save. */
function imageOperationId(form: FormData, documentId: string): string {
  const operationId = String(form.get("operationId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(operationId))
    throw new TypeError("Missing Wiki save operation");
  const hash = createHash("sha256")
    .update(`wiki-image:${operationId}:${documentId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

function wikiImages(form: FormData): WikiImage[] {
  return (
    [
      ...JSON.parse(String(form.get("images") ?? "[]")),
      ...JSON.parse(String(form.get("newImages") ?? "[]")),
    ] as WikiImage[]
  )
    .filter((image) => form.get(`remove-${image.documentId}`) !== "on")
    .map((image, index) => ({
      image: {
        ...image,
        alt: String(form.get(`alt-${image.documentId}`) ?? image.alt).trim(),
        caption:
          String(
            form.get(`caption-${image.documentId}`) ?? image.caption ?? "",
          ).trim() || null,
        credit:
          String(
            form.get(`credit-${image.documentId}`) ?? image.credit ?? "",
          ).trim() || null,
        rights:
          String(
            form.get(`rights-${image.documentId}`) ?? image.rights ?? "",
          ).trim() || null,
        sourceUrl:
          String(
            form.get(`source-${image.documentId}`) ?? image.sourceUrl ?? "",
          ).trim() || null,
        placement:
          (form.get(`placement-${image.documentId}`) ?? image.placement) ===
          "before_body"
            ? ("before_body" as const)
            : ("after_body" as const),
      },
      order: Number(form.get(`order-${image.documentId}`) ?? index + 1),
    }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.image);
}

async function replaceWikiImages(
  images: WikiImage[],
  citations: Awaited<ReturnType<typeof resolveDocumentReferences>>,
  bodyDocument: ReturnType<typeof readWikiDocument>,
  form: FormData,
  authorization: string,
) {
  for (const image of images) {
    const replacement = form.get(`replace-${image.documentId}`);
    if (replacement instanceof File && replacement.size > 0) {
      if (
        wikiCitationIndex(bodyDocument).references.some(
          (ref) => ref.documentId === image.documentId,
        )
      )
        throw new TypeError("Image file is cited inline");
      const uploaded = await replaceDocumentFile(
        image.documentId,
        imageOperationId(form, image.documentId),
        image.revision,
        replacement,
        authorization,
      );
      image.revision = uploaded.revision.revision;
      const citation = citations.find(
        (link) => link.documentId === image.documentId,
      );
      if (citation) {
        citation.document = uploaded;
        citation.revisionId = uploaded.revision.id;
      }
    }
  }
}

export async function saveWikiWorkspaceAction(
  form: FormData,
): Promise<WikiCommandResult> {
  const { targetType, targetId, code, jurisdictionId } = target(form);
  const authorization = await requireSessionBearer();
  let saved = false;
  try {
    if (
      form.get("imageFile") instanceof File &&
      (form.get("imageFile") as File).size
    )
      throw new TypeError("Use the staged image picker");
    const bodyDocument = readWikiDocument(form.get("bodyDocument"));
    const references = mergeWikiReferences(
      readDocumentReferences(String(form.get("citations") ?? "[]")),
      bodyDocument,
    );
    const citations = await resolveDocumentReferences(
      references,
      authorization,
    );
    const images = wikiImages(form);
    await replaceWikiImages(
      images,
      citations,
      bodyDocument,
      form,
      authorization,
    );
    if (images.some((image) => !image.alt))
      throw new TypeError("Alternative text is required");
    const resolvedImages = await resolveDocumentReferences(
      images.map(({ documentId, revision }) => ({ documentId, revision })),
      authorization,
    );
    if (
      resolvedImages.some(
        (link) =>
          ![
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
            "image/avif",
          ].includes(link.document.revision.contentType ?? "") ||
          !link.document.revision.fileName,
      )
    )
      throw new TypeError("image");
    const draft = await saveWikiDraft(
      targetType,
      targetId,
      {
        expectedRevisionId:
          String(form.get("expectedRevisionId") || "") || null,
        operationId: String(form.get("operationId") || "") || undefined,
        citations: citations.map((link) => ({
          documentId: link.documentId,
          revision: link.document.revision.revision,
          title: link.document.revision.title,
          ...(link.citationNote ? { citationNote: link.citationNote } : {}),
        })),
        summary: String(form.get("summary") ?? ""),
        body: bodyDocument
          ? wikiPlainBody(bodyDocument)
          : String(form.get("body") ?? ""),
        bodyDocument,
        images,
        sourceUrls: String(form.get("sourceUrls") ?? "")
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
      },
      authorization,
    );
    saved = true;
    const pins = new Map(
      [...resolvedImages, ...citations].map((link) => [link.documentId, link]),
    );
    for (const link of pins.values()) {
      const doc = link.document;
      await attachDocument(
        draft.targetType === "country"
          ? "country_wiki"
          : draft.targetType === "jurisdiction"
            ? "jurisdiction_wiki"
            : "constitution_wiki",
        targetId,
        doc.id,
        doc.revision.id,
        authorization,
        draft.id,
      );
    }
    revalidatePath(
      wikiPublicPath({ targetType, targetId, code, jurisdictionId }),
    );
    return { ok: true, page: draft };
  } catch {
    return { ok: false, error: saved ? "documents" : "save" };
  }
}

export async function publishWikiWorkspaceAction(
  form: FormData,
): Promise<WikiCommandResult> {
  const { targetType, targetId, code, jurisdictionId } = target(form);
  const authorization = await requireSessionBearer();
  try {
    const page = await publishWikiPage(
      targetType,
      targetId,
      String(form.get("revisionId") ?? ""),
      authorization,
    );
    revalidatePath(
      wikiPublicPath({ targetType, targetId, code, jurisdictionId }),
    );
    return { ok: true, page };
  } catch {
    return { ok: false, error: "publish" };
  }
}

/** Retain native navigation for existing server-action callers. */
export async function saveWikiAction(form: FormData): Promise<string> {
  const owner = target(form),
    result = await saveWikiWorkspaceAction(form);
  return editHref(
    owner.targetType,
    owner.targetId,
    owner.code,
    result.ok ? "saved" : "error",
    form,
  );
}
export async function publishWikiAction(form: FormData): Promise<string> {
  const owner = target(form),
    result = await publishWikiWorkspaceAction(form);
  return editHref(
    owner.targetType,
    owner.targetId,
    owner.code,
    result.ok ? "published" : "error",
    form,
  );
}
