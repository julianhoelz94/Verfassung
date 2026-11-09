import { test, expect } from "./fixtures/consent";
import type { Locator } from "@playwright/test";
import {
  signInAdmin,
  signInReviewer,
  signInPublisher,
  signOut,
} from "./helpers";

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const run = "01900000-0000-4000-8000-000000008500";
const job = "01900000-0000-4000-8000-000000008630";
const proposal = "01900000-0000-4000-8000-000000000802";
const href = `/admin/import/packages/${run}`;

test.beforeEach(async ({ request }) => {
  await request.post(`${mock}/__reset`);
  await request.post(`${mock}/__sprint59_content`);
  await request.post(`${mock}/__import_review`, { data: {} });
  await request.post(`${mock}/__editor_documents`);
});

test("review drafts stay with their author when accounts change in the same tab", async ({
  page,
}) => {
  await signInAdmin(page);
  await page.goto(`${href}?view=review`);
  const reason = page.getByLabel("Review reason", { exact: true });
  await reason.fill("Administrator's unfinished private review note.");
  await signOut(page);
  await signInReviewer(page);
  await page.goto(`${href}?view=review`);
  await expect(reason).toHaveValue("");
  await reason.fill("Reviewer's independent assessment of the source.");
  await signOut(page);
  await signInAdmin(page);
  await page.goto(`${href}?view=review`);
  await expect(reason).toHaveValue(
    "Administrator's unfinished private review note.",
  );
});

for (const width of [390, 1440]) {
  test(`supplementary evidence preserves scopes, pins, captures and review drafts at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await signInAdmin(page);
    const captured = await (
      await request.get(`${mock}/api/ingestion/migration-runs/${run}`)
    ).json();
    await page.goto(href);
    const pageHeader = page.locator("main .page-header");
    expect(
      await pageHeader.evaluate(
        (node) => getComputedStyle(node).borderBottomWidth,
      ),
    ).toBe("0px");
    expect(
      await page
        .getByRole("toolbar")
        .evaluate(
          (node) => getComputedStyle(node.parentElement!).borderBottomWidth,
        ),
    ).toBe("1px");
    await page.getByRole("tab", { name: "Review", exact: true }).click();
    const reason = page.getByLabel("Review reason", { exact: true });
    await reason.fill(
      "Checked the captured wording and supplementary evidence.",
    );
    await page.getByRole("tab", { name: "Content", exact: true }).click();
    const importEvidence = page.getByRole("region", {
      name: "Evidence for this import",
      exact: true,
    });
    const packageEvidence = page.getByRole("region", {
      name: "Evidence for this package",
      exact: true,
    });
    await importEvidence
      .getByRole("button", { name: "Upload new document", exact: true })
      .click();
    await importEvidence.getByLabel("File", { exact: true }).setInputFiles({
      name: "archive-report.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Independent report about the archive."),
    });
    await importEvidence
      .getByLabel("Title", { exact: true })
      .fill("Independent archive report");
    await importEvidence
      .getByText("Citation note / relevant passage", { exact: true })
      .click();
    await importEvidence
      .getByLabel("Note for this attachment")
      .fill("Import wording: Chapter 3, pp. 42–45.");
    let rejected = false;
    await page.route("**/editor/documents/command", (route) => {
      if (!rejected && route.request().method() === "POST") {
        rejected = true;
        return route.fulfill({ status: 503, json: { error: "temporary" } });
      }
      return route.continue();
    });
    await importEvidence
      .getByRole("button", { name: "Upload and attach", exact: true })
      .click();
    await expect(importEvidence.getByRole("alert")).toBeVisible();
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.getByRole("tab", { name: "Content", exact: true }).click();
    await expect(
      importEvidence.getByLabel("Title", { exact: true }),
    ).toHaveValue("Independent archive report");
    await expect(
      importEvidence.getByLabel("File", { exact: true }),
    ).toHaveValue(/archive-report.txt/);
    await importEvidence
      .getByRole("button", { name: "Upload and attach", exact: true })
      .click();
    await expect(
      importEvidence.getByRole("link", {
        name: "Independent archive report",
        exact: true,
      }),
    ).toHaveAttribute("href", /\?revision=1$/);
    await expect(
      packageEvidence.getByRole("link", {
        name: "Independent archive report",
        exact: true,
      }),
    ).toHaveCount(0);
    await chooseExisting(packageEvidence, "Package context: pp. 7–9.");
    await page.getByRole("tab", { name: "Review", exact: true }).click();
    await expect(reason).toHaveValue(
      "Checked the captured wording and supplementary evidence.",
    );
    await page.getByRole("tab", { name: "Content", exact: true }).click();
    const jobLinks = await (
      await request.get(`${mock}/api/document/links/import_job/${job}`)
    ).json();
    const packageLinks = await (
      await request.get(`${mock}/api/document/links/migration_run/${run}`)
    ).json();
    expect(jobLinks).toHaveLength(1);
    expect(packageLinks).toHaveLength(1);
    expect(jobLinks[0].revisionId).toBe(packageLinks[0].revisionId);
    expect(jobLinks[0].citationNote).toBe(
      "Import wording: Chapter 3, pp. 42–45.",
    );
    expect(packageLinks[0].citationNote).toBe("Package context: pp. 7–9.");
    expect(jobLinks[0].document.revision.revision).toBe(1);
    expect(
      await (
        await request.get(`${mock}/api/ingestion/migration-runs/${run}`)
      ).json(),
    ).toEqual(captured);
    await page.goto(`/admin/import/setup/${proposal}`);
    const setupEvidence = page.getByRole("region", {
      name: "Supplementary evidence",
      exact: true,
    });
    await chooseExisting(
      setupEvidence,
      "Proposal context: structural example.",
    );
    const setupLinks = await (
      await request.get(`${mock}/api/document/links/setup_proposal/${proposal}`)
    ).json();
    expect(setupLinks[0]).toMatchObject({
      documentId: jobLinks[0].documentId,
      revisionId: jobLinks[0].revisionId,
      citationNote: "Proposal context: structural example.",
    });
    await page.goto(href);
    await expect(
      importEvidence.getByText("Import wording: Chapter 3, pp. 42–45.", {
        exact: true,
      }),
    ).toBeVisible();
    await importEvidence
      .getByRole("button", {
        name: "Detach: Independent archive report",
        exact: true,
      })
      .click();
    await expect(
      importEvidence.getByRole("link", {
        name: "Independent archive report",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      packageEvidence.getByRole("link", {
        name: "Independent archive report",
        exact: true,
      }),
    ).toBeVisible();
    const library = await (
      await request.get(`${mock}/api/document/library/documents`)
    ).json();
    expect(library.total).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

async function chooseExisting(evidence: Locator, note: string) {
  await evidence
    .getByRole("button", { name: "Choose existing document", exact: true })
    .click();
  const search = evidence.getByRole("combobox", {
    name: "Search documents",
    exact: true,
  });
  await search.fill("Independent archive");
  await expect(
    evidence.getByRole("option", { name: /Independent archive report/ }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await evidence
    .getByText("Citation note / relevant passage", { exact: true })
    .click();
  await evidence.getByLabel("Note for this attachment").fill(note);
  await evidence
    .getByRole("button", { name: "Attach document", exact: true })
    .click();
  await expect(
    evidence.getByRole("link", {
      name: "Independent archive report",
      exact: true,
    }),
  ).toBeVisible();
}

test("review tabs and the pane toggle retain visible keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAdmin(page);
  await page.goto(href);
  const content = page.getByRole("tab", { name: "Content", exact: true });
  const review = page.getByRole("tab", { name: "Review", exact: true });
  const history = page.getByRole("tab", { name: "History", exact: true });
  await content.focus();
  await page.keyboard.press("ArrowRight");
  await expect(review).toBeFocused();
  await expect(review).toHaveAttribute("aria-selected", "true");
  const focus = await review.evaluate((node) => ({
    width: getComputedStyle(node).outlineWidth,
    color: getComputedStyle(node).outlineColor,
    token: getComputedStyle(document.documentElement)
      .getPropertyValue("--color-focus")
      .trim(),
  }));
  expect(Number.parseFloat(focus.width)).toBeGreaterThan(0);
  expect(focus.color).toBe("rgb(166, 106, 36)");
  await page.keyboard.press("End");
  await expect(history).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(content).toBeFocused();
  await page.keyboard.press("Home");
  await expect(content).toHaveAttribute("aria-selected", "true");
  const toggle = page.getByRole("button", { name: /package contents/ });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

for (const [role, signIn] of [
  ["reviewer", signInReviewer],
  ["publisher", signInPublisher],
] as const) {
  test(`${role} can inspect supplementary evidence without attachment or library-write controls`, async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(href);
    await expect(
      page.getByRole("heading", {
        name: "Supplementary evidence",
        exact: true,
      }),
    ).toBeVisible();
    const evidence = page.locator("#supplementary-evidence");
    await expect(
      evidence.getByRole("button", {
        name: "Upload new document",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      evidence.getByRole("button", {
        name: "Choose existing document",
        exact: true,
      }),
    ).toHaveCount(0);
    const status = await page.evaluate(async () => {
      const body = new FormData();
      body.set("command", "attach");
      body.set("targetType", "import_job");
      body.set("targetId", "01900000-0000-4000-8000-000000008630");
      return (
        await fetch("/editor/documents/command", { method: "POST", body })
      ).status;
    });
    expect(status).toBe(403);
  });
}
