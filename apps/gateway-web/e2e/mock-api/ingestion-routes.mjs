import { exactRoute } from "./route.mjs";
import { json, mockState, readBody } from "./state.mjs";

/** Retain status, owner, archive and pagination filtering order. */
export function handleImportJobs(context) {
  const { pathname, method, req, res, searchParams } = context;
  if (!(method === "GET" && pathname === "/api/ingestion/import-jobs"))
    return false;
  const status = new URL(req.url, "http://mock").searchParams.get("status");
  const mine = searchParams.get("mine") === "true";
  const archived = searchParams.get("archived") === "true";
  const offset = Number(searchParams.get("offset") ?? 0);
  const limit = Number(searchParams.get("limit") ?? 100);
  const jobs = [...mockState.importJobs.values()].filter(
    (job) =>
      (!status || job.status === status) &&
      (!mine || job.submittedBy === mockState.currentUser?.id) &&
      Boolean(job.archived) === archived,
  );
  json(res, 200, jobs.slice(offset, offset + limit));
  return true;
}

export const handleStageImport = exactRoute(
  "POST",
  "/api/ingestion/import-jobs",
  handleStageImportResponse,
);

/** Replace the deterministic import job with its submitted payload and owner. */
async function handleStageImportResponse(context) {
  const { req, res } = context;

  const payload = await readBody(req);
  const job = {
    id: "01900000-0000-4000-8000-000000000701",
    status: "pending_review",
    versionId: null,
    isoCode: payload.isoCode,
    countryName: payload.countryName,
    constitutionTitle: payload.constitutionTitle,
    versionLabel: payload.versionLabel,
    submittedBy: mockState.currentUser.id,
    errors: [],
    payload,
    decisions: [],
  };
  mockState.importJobs.set(job.id, job);
  json(res, 201, job);
  return true;
}

/** Match the import job gate before consuming request bytes or mutating state. */
export function handleImportJob(context) {
  const { pathname } = context;
  const importMatch = pathname.match(
    /^\/api\/ingestion\/import-jobs\/([^/]+)(?:\/(payload|decisions|confirm-outline|prepare|approve|reject|publish|archive))?$/,
  );
  if (importMatch) return handleImportJobResponse(context, importMatch);
  return false;
}

/** Retain lookup, method/action, ownership and publication-failure precedence. */
function handleImportJobResponse(context, importMatch) {
  const { req, res, method } = context;
  const [, id, action] = importMatch;
  const job = mockState.importJobs.get(id);
  if (!job) {
    json(res, 404, {});
    return true;
  }
  if (method === "GET") {
    json(
      res,
      200,
      action === "payload"
        ? job.payload
        : action === "decisions"
          ? job.decisions
          : job,
    );
    return true;
  }
  if (method === "POST") return applyImportCommand(context, job, action);
  return false;
}

/** Keep action-specific body consumption, decisions and publication failure precedence. */
async function applyImportCommand({ req, res }, job, action) {
  if (action === "archive") return archiveImport({ req, res }, job);
  if (action === "confirm-outline")
    job.outlineConfirmedBy = mockState.currentUser.id;
  if (action === "prepare")
    job.versionId = "01900000-0000-4000-8000-000000000705";
  if (action === "approve" || action === "reject") {
    const { reason } = await readBody(req);
    job.status = action === "approve" ? "approved" : "rejected";
    job.approvedBy = mockState.currentUser.id;
    job.decisions.push({
      id: "decision",
      decision: job.status,
      reason,
      decidedBy: mockState.currentUser.id,
      decidedAt: new Date().toISOString(),
    });
  }
  if (action === "publish") {
    if (mockState.importPublicationError) {
      json(res, 503, { code: mockState.importPublicationError });
      return true;
    }
    job.status = "completed";
    job.publishedBy = mockState.currentUser.id;
  }
  json(res, 200, job);
  return true;
}

/** Ownership precedes terminal-state validation and the archive body read. */
async function archiveImport({ req, res }, job) {
  if (job.submittedBy !== mockState.currentUser?.id) {
    json(res, 403, {});
    return true;
  }
  if (!["completed", "rejected", "failed"].includes(job.status)) {
    json(res, 409, {});
    return true;
  }
  job.archived = (await readBody(req)).archived;
  res.writeHead(204);
  res.end();
  return true;
}

/** Project prepared import article roots from the first versioned job. */
export function handlePreparedContent(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      pathname ===
        "/api/content/versions/01900000-0000-4000-8000-000000000705/content"
    )
  )
    return false;
  const job = [...mockState.importJobs.values()].find((item) => item.versionId);
  json(res, 200, {
    generation: 1,
    settingsRevisionId: null,
    roots: (job?.payload.articles ?? []).map((article, index) => ({
      logicalId: `import-${index}`,
      revisionId: `revision-${index}`,
      occurrenceId: `occurrence-${index}`,
      kind: "article",
      label: article.articleNumber,
      title: article.title,
      content: [{ type: "text", text: article.body ?? "" }],
    })),
  });
  return true;
}
