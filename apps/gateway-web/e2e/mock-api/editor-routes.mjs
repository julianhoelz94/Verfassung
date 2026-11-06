import { exactRoute } from "./route.mjs";
import {
  EDITORIAL_VERSION_ID,
  continuousReaderUnits,
  SESSION_ID,
  VERSION_1949,
  VERSION_2022,
  editorState,
  extraVersions,
  identityMe,
  json,
  mockAmendments,
  mockState,
  preview,
  readBody,
} from "./state.mjs";

/** Retain availability, ownership/archive filters and numeric pagination order. */
export function handleSessions(context) {
  const { pathname, method, res, searchParams } = context;
  if (!(method === "GET" && pathname === "/api/editor/edit-sessions"))
    return false;
  if (editorState.sessionsUnavailable) {
    json(res, 503, { error: "Sessions unavailable" });
    return true;
  }
  let sessions = [
    ...editorState.seededSessions,
    ...(editorState.session
      ? [
          {
            id: editorState.session.id,
            versionId: editorState.session.versionId,
            status: editorState.session.status,
            openedBy: editorState.session.actorId,
            openedAt: "2026-01-01T00:00:00Z",
            updatedAt: editorState.session.updatedAt ?? "2026-01-01T00:00:00Z",
            changedArticleCount: editorState.session.drafts.length,
            hopKind: editorState.session.hopKind,
          },
        ]
      : []),
  ];
  sessions = sessions.filter(
    (session) =>
      session.status !== "discarded" &&
      Boolean(session.archived) === (searchParams.get("archived") === "true"),
  );
  const status = searchParams.get("status");
  if (status) {
    sessions = sessions.filter((session) => session.status === status);
  }
  const openedBy = searchParams.get("openedBy");
  if (openedBy)
    sessions = sessions.filter(
      (session) =>
        session.openedBy ===
        (openedBy === "me" ? mockState.currentUser?.id : openedBy),
    );
  const versionId = searchParams.get("versionId");
  if (versionId)
    sessions = sessions.filter((session) => session.versionId === versionId);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 100)),
  );
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  json(res, 200, sessions.slice(offset, offset + limit));
  return true;
}

export const handleCreateSession = exactRoute(
  "POST",
  "/api/editor/edit-sessions",
  handleCreateSessionResponse,
);

/** Replace the active session using the existing deterministic identity and defaults. */
async function handleCreateSessionResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  editorState.session = {
    id: SESSION_ID,
    actorId: identityMe.id,
    versionId: body.versionId ?? VERSION_2022,
    hopKind: body.hopKind ?? null,
    status: "open",
    revisionCount: 0,
    drafts: [],
  };
  json(res, 200, editorState.session);
  return true;
}

/** Match the manage session gate before consuming request bytes or mutating state. */
export function handleManageSession(context) {
  const { method, pathname } = context;
  const managedSession = pathname.match(
    /^\/api\/editor\/edit-sessions\/([^/]+)(\/archive)?$/,
  );
  if (
    managedSession &&
    (method === "DELETE" || (method === "POST" && managedSession[2]))
  )
    return handleManageSessionResponse(context, managedSession);
  return false;
}

/** Preserve lookup, ownership and state guards before discard/archive changes. */
async function handleManageSessionResponse(context, managedSession) {
  const { req, res, method } = context;

  const session =
    editorState.seededSessions.find((item) => item.id === managedSession[1]) ??
    (editorState.session?.id === managedSession[1]
      ? editorState.session
      : null);
  if (!session) {
    json(res, 404, {});
    return true;
  }
  if ((session.openedBy ?? session.actorId) !== mockState.currentUser?.id) {
    json(res, 403, {});
    return true;
  }
  if (method === "DELETE") {
    if (session.status !== "open") {
      json(res, 409, {});
      return true;
    }
    session.status = "discarded";
  } else {
    if (session.status !== "published") {
      json(res, 409, {});
      return true;
    }
    session.archived = (await readBody(req)).archived;
  }
  res.writeHead(204);
  res.end();
  return true;
}

/** Expose only the active session preview and its historical missing-session response. */
export function handleSession(context) {
  const { method, pathname, res } = context;
  if (method === "GET" && mockState.continuousReader && pathname === `/api/editor/edit-sessions/${editorState.session?.id}/structured-draft`) {
    const roots = continuousReaderUnits(editorState.session.versionId).map(unit => ({
      logicalId: unit.logicalId, revisionId: unit.revisionId, occurrenceId: unit.id,
      kind: unit.kind, label: unit.articleNumber, title: unit.title, content: unit.content,
    }));
    json(res, 200, { sessionId: editorState.session.id, sourceVersionId: editorState.session.versionId,
      sourceGeneration: 1, generation: 1, settingsRevisionId: "01900000-0000-4000-8000-000000000901",
      roots, sourceRoots: structuredClone(roots), operations: [] });
    return true;
  }
  const editorSession = pathname.match(
    /^\/api\/editor\/edit-sessions\/([^/]+)$/,
  );
  if (!(method === "GET" && editorSession)) return false;
  if (!editorState.session || editorState.session.id !== editorSession[1]) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  json(res, 200, preview());
  return true;
}

/** Match the publish details gate before consuming request bytes or mutating state. */
export function handlePublishDetails(context) {
  const { method, pathname } = context;
  const publishDetailsMatch = pathname.match(
    /^\/api\/editor\/edit-sessions\/([^/]+)\/publish-details$/,
  );
  if (
    method === "POST" &&
    publishDetailsMatch &&
    editorState.session?.id === publishDetailsMatch[1]
  )
    return handlePublishDetailsResponse(context, publishDetailsMatch);
  return false;
}

/** Update publication metadata only for the active matching session. */
async function handlePublishDetailsResponse(context, publishDetailsMatch) {
  const { req, res } = context;

  const body = await readBody(req);
  editorState.session.publishComment = body.comment ?? null;
  editorState.session.changeRecord = body.changeRecord ?? null;
  json(res, 200, preview());
  return true;
}

/** Match the session command gate before consuming request bytes or mutating state. */
export function handleSessionCommand(context) {
  const { method, pathname } = context;
  const editorCommand = pathname.match(
    /^\/api\/editor\/edit-sessions\/([^/]+)\/(saves|review|approval|publish)$/,
  );
  if (
    method === "POST" &&
    editorCommand &&
    editorState.session?.id === editorCommand[1]
  )
    return handleSessionCommandResponse(context, editorCommand);
  return false;
}

/** Keep draft saves and publication state/version/amendment effects in original order. */
async function handleSessionCommandResponse(context, editorCommand) {
  const { req, res } = context;

  const command = editorCommand[2];
  if (command === "saves") {
    const body = await readBody(req);
    const drafts = editorState.session.drafts.filter(
      (draft) => draft.articleId !== body.articleId,
    );
    drafts.push({
      articleId: body.articleId,
      title: body.title,
      body: body.body,
    });
    editorState.session.drafts = drafts;
    editorState.session.revisionCount += 1;
  } else if (command === "review") {
    editorState.session.status = "reviewing";
  } else if (command === "approval") {
    editorState.session.status = "approved";
  } else if (command === "publish") {
    if (await publishSession(req, res)) return true;
  }
  json(res, 200, preview());
  return true;
}

/** Check freshness before reading publication details and applying version/link-review effects. */
async function publishSession(req, res) {
  if (!mockState.stepUpFresh) {
    json(res, 403, {
      error: "Fresh authentication required",
      code: "step_up_required",
    });
    return true;
  }
  const body = await readBody(req);
  editorState.session.status = "published";
  if (
    body.hopKind === "editorial_correction" &&
    !extraVersions.some((version) => version.id === EDITORIAL_VERSION_ID)
  ) {
    const correctedVersionId = editorState.session.versionId;
    const correctedVersionLabel =
      correctedVersionId === VERSION_1949 ? "1949-1" : "2022-1";
    extraVersions.push({
      id: EDITORIAL_VERSION_ID,
      versionLabel: correctedVersionLabel,
      effectiveDate: "2022-12-20",
      languageCode: "en",
      sourceUrl: null,
      gazetteReference: null,
      provenance: "editorial",
      verificationState: "unverified",
      verifiedBy: null,
      verifiedAt: null,
      predecessorVersionId: correctedVersionId,
      hopKind: "editorial_correction",
      listing: "staff",
      latestPublished: true,
    });
    editorState.session.newVersionLabel = correctedVersionLabel;
    for (const [id, record] of mockAmendments) {
      if (
        record.status === "published" &&
        (record.sourceVersionId === correctedVersionId ||
          record.targetVersionId === correctedVersionId)
      ) {
        mockAmendments.set(id, { ...record, reviewStatus: "needs_review" });
      }
    }
  } else if (body.hopKind === "legal") {
    const legalVersionId = "01900000-0000-4000-8000-000000000502";
    if (!extraVersions.some((version) => version.id === legalVersionId)) {
      extraVersions.push({
        id: legalVersionId,
        versionLabel: "2027",
        effectiveDate: "2027-01-01",
        languageCode: "en",
        sourceUrl: null,
        gazetteReference: null,
        provenance: "editorial",
        verificationState: "unverified",
        verifiedBy: null,
        verifiedAt: null,
        predecessorVersionId: editorState.session.versionId,
        hopKind: "legal",
        listing: "public",
        latestPublished: true,
      });
    }
    editorState.session.newVersionId = legalVersionId;
    editorState.session.newVersionLabel = "2027";
  }

  return false;
}
