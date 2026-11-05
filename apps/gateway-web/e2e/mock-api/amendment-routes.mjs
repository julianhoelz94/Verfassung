import { exactRoute } from "./route.mjs";
import {
  CONSTITUTION_ID,
  amendment,
  amendmentDraft,
  amendmentRevision,
  json,
  mockAmendments,
  readBody,
} from "./state.mjs";

/** Model server-derived reader links rather than trusting submitted URLs. */
function amendmentReaderLinks(changes = []) {
  const reference = ref => ref?.versionId && (ref.occurrenceId || ref.rootOccurrenceId)
    ? { ...ref, deepLink: `/countries/DE/versions/${encodeURIComponent(ref.versionId)}#${encodeURIComponent(ref.occurrenceId || ref.rootOccurrenceId)}` }
    : ref;
  return changes.map(change => ({ ...change, beforeRef: reference(change.beforeRef), afterRef: reference(change.afterRef) }));
}

/** Retain the version-scoped published amendment fixture. */
export function handleVersionAmendments(context) {
  const { method, pathname, res } = context;
  const amendmentMatch = pathname.match(
    /^\/api\/amendment\/versions\/([^/]+)\/amendments$/,
  );
  if (!(method === "GET" && amendmentMatch)) return false;
  json(res, 200, [amendment]);
  return true;
}

/** Filter constitution, publication and review state in their original order. */
export function handleConstitutionAmendments(context) {
  const { method, pathname, res, searchParams } = context;
  const constitutionAmendmentsMatch = pathname.match(
    /^\/api\/amendment\/constitutions\/([^/]+)\/amendments$/,
  );
  if (!(method === "GET" && constitutionAmendmentsMatch)) return false;
  if (constitutionAmendmentsMatch[1] !== CONSTITUTION_ID) {
    json(res, 200, []);
    return true;
  }
  const items = [...mockAmendments.values()];
  const staff = searchParams.get("status") === "all";
  const reviewStatus = searchParams.get("reviewStatus");
  json(
    res,
    200,
    (staff
      ? items
      : items.filter((item) => item.status === "published")
    ).filter((item) => !reviewStatus || item.reviewStatus === reviewStatus),
  );
  return true;
}

/** Return the current mutable change record or its missing-record error. */
export function handleAmendment(context) {
  const { method, pathname, res } = context;
  const amendmentByIdMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)$/,
  );
  if (!(method === "GET" && amendmentByIdMatch)) return false;
  const item = mockAmendments.get(amendmentByIdMatch[1]);
  if (!item) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  json(res, 200, item);
  return true;
}

/** Match the create amendment gate before consuming request bytes or mutating state. */
export function handleCreateAmendment(context) {
  const { method, pathname } = context;
  const constitutionAmendmentsMatch = pathname.match(
    /^\/api\/amendment\/constitutions\/([^/]+)\/amendments$/,
  );
  if (method === "POST" && constitutionAmendmentsMatch)
    return handleCreateAmendmentResponse(context, constitutionAmendmentsMatch);
  return false;
}

/** Preserve submitted defaults and replace the deterministic draft identity. */
async function handleCreateAmendmentResponse(
  context,
  constitutionAmendmentsMatch,
) {
  const { req, res } = context;

  const body = await readBody(req);
  const created = {
    ...amendmentDraft,
    id: "01900000-0000-4000-8000-000000000303",
    title: body.title ?? amendmentDraft.title,
    summary: body.summary ?? amendmentDraft.summary,
    comment: body.comment ?? amendmentDraft.comment,
    documents: body.documents ?? amendmentDraft.documents ?? [],
    kind: body.kind ?? amendmentDraft.kind,
    status: "draft",
    constitutionId: constitutionAmendmentsMatch[1],
    enactedOn: body.enactedOn ?? null,
    effectiveOn: body.effectiveOn ?? null,
    sourceReference: body.sourceReference ?? null,
    sourceVersionId: body.sourceVersionId ?? null,
    targetVersionId: body.targetVersionId ?? null,
    changes: amendmentReaderLinks(body.changes),
  };
  mockAmendments.set(created.id, created);
  json(res, 201, created);
  return true;
}

/** Retain historical-first revision projection and change field selection. */
export function handleAmendmentRevisions(context) {
  const { method, pathname, res } = context;
  const amendmentRevisionMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)\/revisions$/,
  );
  if (!(method === "GET" && amendmentRevisionMatch)) return false;
  const existing = mockAmendments.get(amendmentRevisionMatch[1]);
  if (!existing) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  const currentRevision = {
    ...amendmentRevision,
    id: "01900000-0000-4000-8000-000000000322",
    predecessorRevisionId: amendmentRevision.id,
    createdAt: "2022-12-20T12:00:00Z",
    title: existing.title,
    summary: existing.summary,
    changes: existing.changes.map(({ articleNumber, changeType, note }) => ({
      articleNumber,
      changeType,
      note,
    })),
  };
  json(res, 200, [amendmentRevision, currentRevision]);
  return true;
}

/** Expose the current snapshot pins with the original empty review queue. */
export function handleDiffReview(context) {
  const { method, pathname, res } = context;
  const amendmentDiffReviewMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)\/diff-review$/,
  );
  if (!(method === "GET" && amendmentDiffReviewMatch)) return false;
  const existing = mockAmendments.get(amendmentDiffReviewMatch[1]);
  if (!existing) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  json(res, 200, {
    revisionId: amendmentRevision.id,
    sourceVersionId: existing.sourceVersionId,
    targetVersionId: existing.targetVersionId,
    candidates: [],
    decisions: [],
    totals: { total: 0, resolved: 0 },
    currentPosition: null,
  });
  return true;
}

export const handleSuggestAmendments = exactRoute(
  "POST",
  "/api/amendment/amendments/suggest",
  handleSuggestAmendmentsResponse,
);

/** Require both versions before returning the fixed suggested change projection. */
async function handleSuggestAmendmentsResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  if (!body.sourceVersionId || !body.targetVersionId) {
    json(res, 400, { error: "Missing versions" });
    return true;
  }
  json(res, 200, {
    changes: amendment.changes.map(
      ({ articleNumber, changeType, note, nodeId, articleId }) => ({
        articleNumber,
        changeType,
        note,
        nodeId,
        articleId,
      }),
    ),
  });
  return true;
}

/** Match the revise amendment gate before consuming request bytes or mutating state. */
export function handleReviseAmendment(context) {
  const { method, pathname } = context;
  const amendmentRevisionMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)\/revisions$/,
  );
  if (method === "POST" && amendmentRevisionMatch)
    return handleReviseAmendmentResponse(context, amendmentRevisionMatch);
  return false;
}

/** Merge revision content while retaining identity, status and constitution. */
async function handleReviseAmendmentResponse(context, amendmentRevisionMatch) {
  const { req, res } = context;

  const existing = mockAmendments.get(amendmentRevisionMatch[1]);
  if (!existing) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  const body = await readBody(req);
  const updated = {
    ...existing,
    ...body,
    changes: amendmentReaderLinks(body.changes ?? existing.changes),
    id: existing.id,
    status: existing.status,
    constitutionId: existing.constitutionId,
  };
  mockAmendments.set(updated.id, updated);
  json(res, 200, updated);
  return true;
}

/** Publish the current record while retaining an existing publication pin. */
export function handlePublishAmendment(context) {
  const { method, pathname, res } = context;
  const amendmentPublishMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)\/publish$/,
  );
  if (!(method === "POST" && amendmentPublishMatch)) return false;
  const existing = mockAmendments.get(amendmentPublishMatch[1]);
  if (!existing) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  const updated = {
    ...existing,
    status: "published",
    publishedRevisionId: existing.publishedRevisionId ?? amendmentRevision.id,
  };
  mockAmendments.set(updated.id, updated);
  json(res, 200, updated);
  return true;
}

/** Keep quote confirmation and publication status changes atomic in fixture state. */
export function handleConfirmQuotes(context) {
  const { method, pathname, res } = context;
  const confirmQuotesMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)\/confirm-quotes$/,
  );
  if (!(method === "POST" && confirmQuotesMatch)) return false;
  const existing = mockAmendments.get(confirmQuotesMatch[1]);
  if (!existing) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  const updated = { ...existing, reviewStatus: "ok", status: "published" };
  mockAmendments.set(updated.id, updated);
  json(res, 200, updated);
  return true;
}

/** Retain record content while moving its status to withdrawn. */
export function handleWithdrawAmendment(context) {
  const { method, pathname, res } = context;
  const amendmentWithdrawMatch = pathname.match(
    /^\/api\/amendment\/amendments\/([^/]+)\/withdraw$/,
  );
  if (!(method === "POST" && amendmentWithdrawMatch)) return false;
  const existing = mockAmendments.get(amendmentWithdrawMatch[1]);
  if (!existing) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  const updated = { ...existing, status: "withdrawn" };
  mockAmendments.set(updated.id, updated);
  json(res, 200, updated);
  return true;
}

/** Preserve exact article-number matching for the published fixture. */
export function handleArticleAmendments(context) {
  const { pathname, method, res, searchParams } = context;
  if (!(method === "GET" && pathname === "/api/amendment/amendments"))
    return false;
  const articleNumber = searchParams.get("articleNumber");
  json(
    res,
    200,
    articleNumber &&
      amendment.changes.some((change) => change.articleNumber === articleNumber)
      ? [amendment]
      : [],
  );
  return true;
}
