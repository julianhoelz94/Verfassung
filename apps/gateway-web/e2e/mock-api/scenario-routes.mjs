import { editorDocuments } from "../fixtures/editor-documents.mjs";
import { exactRoute } from "./route.mjs";
import {
  countryDirectoryFixtures,
  editorState,
  empty,
  extraVersions,
  germany,
  json,
  mockState,
  readBody,
  resetMockState,
  reviewFixtures,
} from "./state.mjs";

/** Expose liveness before all scenario overrides and authentication. */
export function handleHealth(context) {
  const { pathname, res } = context;
  if (!(pathname === "/health")) return false;
  json(res, 200, { ok: true });
  return true;
}

/** Install a fresh document store before other scenario overrides. */
export function handleEditorDocumentsSetup(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__editor_documents")) return false;
  mockState.editorDocumentScenario = editorDocuments();
  json(res, 200, {});
  return true;
}

/** Keep synchronous misses and delegate only while the document scenario is enabled. */
export function handleEditorDocumentsOverride(context) {
  if (!mockState.editorDocumentScenario) return false;
  return handleEditorDocumentsResponse(context);
}

/** Let recognized document endpoints override later UI-review and domain routes. */
async function handleEditorDocumentsResponse({ req, res, method, url }) {
  const response = await mockState.editorDocumentScenario(req, method, url);
  if (!response) return false;
  json(res, response.status, await response.json());
  return true;
}

/** Reset replacements and retained collections in their original order. */
export function handleReset(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__reset")) return false;
  resetMockState();
  empty(res, 204);
  return true;
}

export const handleCountryDirectory = exactRoute(
  "POST",
  "/__country_directory",
  handleCountryDirectoryResponse,
);

/** Install regional directory data before later Catalog handlers. */
async function handleCountryDirectoryResponse(context) {
  const { req, res } = context;

  mockState.directoryScenario = countryDirectoryFixtures(germany);
  mockState.directoryUnavailable = (await readBody(req)).unavailable ?? [];
  json(res, 200, { ok: true });
  return true;
}

/** Match the directory wiki gate before consuming request bytes or mutating state. */
export function handleDirectoryWiki(context) {
  const { pathname } = context;
  if (mockState.directoryScenario?.matchesWiki(pathname))
    return handleDirectoryWikiResponse(context);
  return false;
}

/** Delegate directory Wiki writes before the general UI-review override. */
async function handleDirectoryWikiResponse(context) {
  const { req, res, pathname, method } = context;

  const payload =
    method === "PUT" || method === "POST" ? await readBody(req) : null;
  const response = mockState.directoryScenario.wikiResponse(
    method,
    pathname,
    payload,
    Boolean(req.headers.authorization),
  );
  json(res, response.status, response.body);
  return true;
}

/** Let directory reads override only routes the scenario recognizes. */
export function handleDirectoryRead(context) {
  const { method, res, pathname } = context;
  if (!(method === "GET" && mockState.directoryScenario)) return false;
  const response = mockState.directoryScenario.response(
    pathname,
    mockState.directoryUnavailable,
  );
  if (response) {
    json(res, response.status, response.body);
    return true;
  }
  return false;
}

export const handleContinuousReader = exactRoute(
  "POST",
  "/__continuous_reader",
  handleContinuousReaderResponse,
);

/** Enable ordered reader fixtures and authored footnote wording lazily. */
async function handleContinuousReaderResponse(context) {
  const { req, res } = context;

  mockState.continuousReader = true;
  mockState.sprint50Content = true;
  mockState.authoredFootnoteWords = Boolean(
    (await readBody(req)).authoredFootnoteWords,
  );
  json(res, 200, { ok: true });
  return true;
}

export const handleUnavailableHistory = exactRoute(
  "POST",
  "/__history_unavailable",
  handleUnavailableHistoryResponse,
);

/** Merge requested history failures without resetting other flags. */
async function handleUnavailableHistoryResponse(context) {
  const { req, res } = context;

  mockState.historyUnavailable = {
    ...mockState.historyUnavailable,
    ...(await readBody(req)),
  };
  empty(res, 204);
  return true;
}

/** Apply history failures before the general UI-review and domain routes. */
export function handleHistoryFailure(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      ((mockState.historyUnavailable.lifecycle &&
        /\/countries\/DE\/(constitution|provision)-lifecycle$/.test(
          pathname,
        )) ||
        (mockState.historyUnavailable.amendments &&
          pathname.startsWith("/api/amendment/constitutions/") &&
          pathname.endsWith("/amendments")))
    )
  )
    return false;
  json(res, 503, { error: "History source unavailable" });
  return true;
}

/** Enable dense content and deterministic editorial users together. */
export function handleDenseContent(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__usability_content")) return false;
  mockState.denseUi = true;
  mockState.sprint50Content = true;
  mockState.managedUsers = Array.from({ length: 30 }, (_, index) => ({
    id: `dense-user-${index}`,
    email: `long.editorial.account.${index}@constitution-atlas.example.local`,
    roles: ["viewer", "editor", "reviewer", "publisher", "admin"],
    enabled: true,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
  }));
  empty(res, 204);
  return true;
}

export const handleImportPublicationError = exactRoute(
  "POST",
  "/__import_publication_error",
  handleImportPublicationErrorResponse,
);

/** Set the next import publication failure without consuming the import. */
async function handleImportPublicationErrorResponse(context) {
  const { req, res } = context;

  mockState.importPublicationError = (await readBody(req)).code ?? null;
  json(res, 200, {});
  return true;
}

/** Install review fixtures and append their correction versions. */
export function handleUiReviewSetup(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__sprint59_content")) return false;
  mockState.uiReview = reviewFixtures(germany);
  mockState.sprint50Content = true;
  extraVersions.push(...mockState.uiReview.corrections);
  json(res, 200, { ok: true });
  return true;
}

/** Require enrollment on the next successful login only. */
export function handleRequiredEnrollment(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__mfa_enrollment")) return false;
  mockState.forceEnrollment = true;
  json(res, 200, { ok: true });
  return true;
}

/** Match the ui review override gate before consuming request bytes or mutating state. */
export function handleUiReviewOverride(context) {
  if (mockState.uiReview) return handleUiReviewOverrideResponse(context);
  return false;
}

/** Preserve Response-versus-undefined interception and lazy review body reads. */
async function handleUiReviewOverrideResponse(context) {
  const { req, res, pathname, method } = context;

  const response = await mockState.uiReview.response(
    req,
    method,
    pathname,
    readBody,
  );
  if (response instanceof Response) {
    json(res, response.status, await response.json());
    return true;
  }
  if (response !== undefined) {
    json(res, 200, response);
    return true;
  }

  return false;
}

export const handleSeedEditorSessions = exactRoute(
  "POST",
  "/__editor_sessions",
  handleSeedEditorSessionsResponse,
);

/** Replace seeded editor session summaries and availability flags. */
async function handleSeedEditorSessionsResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  editorState.seededSessions = body.sessions ?? [];
  editorState.sessionsUnavailable = body.unavailable ?? false;
  empty(res, 204);
  return true;
}

/** Keep the global and current-user freshness projections synchronized. */
export function handleStaleStepUp(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__step_up_stale")) return false;
  mockState.stepUpFresh = false;
  mockState.currentUser = { ...mockState.currentUser, stepUpFresh: false };
  empty(res, 204);
  return true;
}

/** Enable the visual role set for later user projection. */
export function handleVisualRoles(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__visual_roles")) return false;
  mockState.visualRoles = true;
  empty(res, 204);
  return true;
}

/** Enable historical content without resetting other scenarios. */
export function handleSprintContent(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__sprint50_content")) return false;
  mockState.sprint50Content = true;
  empty(res, 204);
  return true;
}

/** Remove both contact pins for the unpublished-contact scenario. */
export function handleUnpublishedContact(context) {
  const { pathname, method, res } = context;
  if (!(method === "POST" && pathname === "/__unpublished_imprint_contact"))
    return false;
  mockState.imprintDetailsState.published = null;
  mockState.imprintDetailsState.draft = null;
  empty(res, 204);
  return true;
}
