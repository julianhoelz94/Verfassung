import { createHash } from "node:crypto";
import { json, mockState, readBody } from "./state.mjs";

const runId = "01900000-0000-4000-8000-000000008500";
const ids = [0, 1].map((index) => ({
  document: `01900000-0000-4000-8000-00000000861${index}`,
  version: `01900000-0000-4000-8000-00000000862${index}`,
  job: `01900000-0000-4000-8000-00000000863${index}`,
}));
const source = (year) =>
  `<article><h2>Archive charter · ${year}</h2><h3>Article 1 — Rights</h3><p>Human dignity is inviolable.</p><p>All people are equal before the law.</p><script>window.__sourceExecuted=true</script><img src="https://example.invalid/tracker"></article>`;
let run;
let attempts;

/** Opt-in package fixtures share the existing import job state and transition handlers. */
export async function handleImportReviewFixture({
  method,
  pathname,
  req,
  res,
}) {
  if (method === "POST" && pathname === "/__reset") {
    run = undefined;
    attempts = [];
    return false;
  }
  if (method === "POST" && pathname === "/__import_review") {
    const options = await readBody(req);
    initializeFixture(options);
    json(res, 200, { runId, ids });
    return true;
  }
  if (!run) return false;
  return (
    handlePackageRoute(method, pathname, res) ||
    handleRecordRoute(method, pathname, res)
  );
}

function initializeFixture(options) {
  const items = [],
    sources = [];
  for (const [index, year] of [1946, 1953].entries()) {
    const id = ids[index];
    const prepared = !options.submitted;
    sources.push({
      sourceKey: `archive-${year}.html`,
      captureKey: `source-${year}`,
      targetKeys: [`version-${year}`],
      url: `https://archive.example/${year}`,
      sha256: createHash("sha256").update(source(year)).digest("hex"),
      encoding: "utf-8",
      aliases: [],
      disposition: "included",
    });
    items.push({
      id: `source-${year}`,
      sourceKey: `source-${year}`,
      kind: "document",
      sha256: sources[index].sha256,
      dependencies: [],
      state: prepared ? "prepared" : "staged",
      attempts: prepared ? 1 : 0,
      error: null,
      result: prepared ? { documentId: id.document, revision: 1 } : {},
    });
    items.push({
      id: `version-${year}`,
      sourceKey: `version-${year}`,
      kind: "snapshot",
      sha256: "a".repeat(64),
      dependencies: [`source-${year}`],
      state: prepared ? "prepared" : "staged",
      attempts: prepared ? 1 : 0,
      error: null,
      result: {
        jobId: id.job,
        ...(prepared ? { versionId: id.version } : {}),
      },
    });
    mockState.importJobs.set(id.job, {
      id: id.job,
      status: "pending_review",
      versionId: prepared ? id.version : null,
      isoCode: "DE",
      constitutionTitle: "Archive charter",
      versionLabel: String(year),
      errors: [],
      submittedBy: mockState.currentUser?.id,
      decisions: [],
      payload: {
        isoCode: "DE",
        countryName: "Germany",
        constitutionTitle: "Archive charter",
        constitutionSlug: "archive-charter",
        versionLabel: String(year),
        sourceUrl: sources[index].url,
        articles: [
          {
            articleNumber: "1",
            title: "Rights",
            body: "Human dignity is inviolable.\nAll people are equal before the law.",
          },
        ],
      },
    });
  }
  items.push({
    id: "comparison",
    sourceKey: "comparison",
    kind: "comparison",
    sha256: "b".repeat(64),
    dependencies: ["version-1946", "version-1953"],
    state: "staged",
    result: {},
    attempts: 0,
    error: null,
  });
  run = {
    id: runId,
    ownerId: mockState.currentUser?.id,
    manifest: {
      runKey: "review-fixture",
      title: "Constitution archive · 1946–1953",
      sources,
    },
    items,
    coverage: {},
  };
  attempts = [];
}

function handlePackageRoute(method, pathname, res) {
  if (method === "GET" && pathname === "/api/ingestion/migration-runs") {
    json(res, 200, [
      {
        id: runId,
        title: run.manifest.title,
        coverage: {
          prepared: run.items.filter((item) => item.state === "prepared")
            .length,
          staged: run.items.length,
        },
      },
    ]);
    return true;
  }
  if (
    method === "GET" &&
    pathname === `/api/ingestion/migration-runs/${runId}`
  ) {
    for (const item of run.items)
      if (item.result.jobId)
        item.result.status = mockState.importJobs.get(item.result.jobId).status;
    run.coverage = {
      prepared: run.items.filter((item) => item.state === "prepared").length,
      staged: run.items.length,
      sources: 2,
      unavailable: 0,
      excluded: 0,
    };
    json(res, 200, run);
    return true;
  }
  const itemPath = pathname.match(
    new RegExp(
      `^/api/ingestion/migration-runs/${runId}/items/([^/]+)/(prepare|attempts)$`,
    ),
  );
  if (itemPath) {
    const item = run.items.find((candidate) => candidate.id === itemPath[1]);
    if (method === "GET")
      json(res, 200, {
        items: attempts.filter((attempt) => attempt.itemId === item.id),
        nextOffset: null,
      });
    else {
      if (!prepareFixtureItem(item, res)) return true;
      json(res, 200, item);
    }
    return true;
  }
  return false;
}

function prepareFixtureItem(item, res) {
  if (
    item.dependencies.some(
      (key) =>
        run.items.find((candidate) => candidate.sourceKey === key)?.state !==
        "prepared",
    )
  ) {
    json(res, 409, { code: "dependency" });
    return false;
  }
  item.state = "prepared";
  item.attempts++;
  if (item.kind === "document")
    item.result = {
      documentId: ids[item.sourceKey.endsWith("1953") ? 1 : 0].document,
      revision: 1,
    };
  if (item.kind === "snapshot") {
    const id = ids[item.sourceKey.endsWith("1953") ? 1 : 0];
    mockState.importJobs.get(id.job).versionId = id.version;
    item.result.versionId = id.version;
  }
  if (item.kind === "comparison")
    item.result.comparisonId = "01900000-0000-4000-8000-000000008640";
  attempts.push({
    itemId: item.id,
    number: item.attempts,
    state: item.state,
    startedAt: "2026-11-09T10:00:00Z",
    finishedAt: "2026-11-09T10:00:01Z",
    error: null,
  });
  return true;
}

function handleRecordRoute(method, pathname, res) {
  for (const [index, id] of ids.entries()) {
    if (
      method === "GET" &&
      pathname === `/api/document/documents/${id.document}/revisions/1/file`
    ) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(source(index ? 1953 : 1946));
      return true;
    }
    if (
      method === "GET" &&
      pathname === `/api/content/versions/${id.version}/content`
    ) {
      json(res, 200, {
        generation: 1,
        settingsRevisionId: null,
        roots: [
          {
            logicalId: `article-${index}`,
            revisionId: `revision-${index}`,
            occurrenceId: `article-${index}`,
            kind: "article",
            label: "1",
            title: "Rights",
            content: [
              {
                type: "text",
                text: "Human dignity is inviolable.\nAll people are equal before the law.",
              },
            ],
          },
        ],
      });
      return true;
    }
    if (
      method === "GET" &&
      pathname === `/api/catalog/versions/${id.version}/reader-settings`
    ) {
      json(res, 200, {
        kinds: [
          {
            kindCode: "article",
            displayLabel: "Article",
            root: true,
            allowedChildKinds: [],
            mayHoldText: true,
            mayHoldChildren: false,
            presentation: "section",
            showKind: true,
            showLabel: true,
            showTitle: true,
          },
        ],
      });
      return true;
    }
    if (
      method === "GET" &&
      pathname === `/api/ingestion/import-jobs/${id.job}/export`
    ) {
      json(res, 200, {
        fidelity: [],
        fidelityComplete: true,
        resourcesComplete: true,
        counts: {},
        snapshotId: id.version,
        complete: true,
        totalRecords: 1,
        nextCursor: null,
      });
      return true;
    }
  }
  return false;
}
