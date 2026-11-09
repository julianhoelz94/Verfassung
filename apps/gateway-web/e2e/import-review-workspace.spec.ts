import { test, expect } from "./fixtures/consent";
import { signInAdmin } from "./helpers";
import { readFileSync } from "node:fs";

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const run = "01900000-0000-4000-8000-000000008500";
const href = `/admin/import/packages/${run}`;
test.beforeEach(async ({ request }) => {
  await request.post(`${mock}/__reset`);
  await request.post(`${mock}/__import_review`, { data: {} });
});

for (const width of [390, 820, 1440])
  for (const locale of ["en", "de"]) {
    test(`shared import views and retained decisions at ${width}px in ${locale}`, async ({
      page,
      request,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await signInAdmin(page);
      await request.put(`${mock}/api/identity/me/language`, {
        headers: { Authorization: "Bearer e2e-session-token" },
        data: { languagePreference: locale },
      });
      await page.setExtraHTTPHeaders({ "Accept-Language": locale });
      await page.goto(href);
      const en = locale === "en";
      const content = page.getByRole("tab", {
        name: en ? "Content" : "Inhalt",
        exact: true,
      });
      const review = page.getByRole("tab", {
        name: en ? "Review" : "Prüfung",
        exact: true,
      });
      const display = page.getByRole("group", {
        name: en ? "Display" : "Darstellung",
        exact: true,
      });
      await expect(
        page.getByRole("tab", { name: en ? "Source" : "Quelle", exact: true }),
      ).toHaveCount(0);
      await expect(display.getByRole("button")).toHaveCount(3);
      for (const [mode, label] of [
        ["reading", en ? "Reading text only" : "Nur Lesefassung"],
        ["source", en ? "Source only" : "Nur Quelle"],
        [
          "compare",
          en
            ? "Compare reading text and source"
            : "Lesefassung und Quelle vergleichen",
        ],
      ]) {
        await display.getByRole("button", { name: label, exact: true }).click();
        await expect(page.locator(`[data-display="${mode}"]`)).toBeVisible();
        await expect(display.locator('[aria-pressed="true"]')).toHaveCount(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { __sourceExecuted?: boolean })
              .__sourceExecuted,
        ),
      ).toBeUndefined();
      await review.click();
      const reason = page.getByRole("textbox", {
        name: en ? "Review reason" : "Begründung der Entscheidung",
        exact: true,
      });
      await reason.fill(
        "Checked the exact wording and all notes against the archived source.",
      );
      await content.click();
      await review.click();
      await expect(reason).toHaveValue(
        "Checked the exact wording and all notes against the archived source.",
      );
      await page.addScriptTag({
        content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"),
      });
      const violations = await page.evaluate(
        async () =>
          (
            await (
              window as unknown as {
                axe: {
                  run: (
                    target: Element,
                    options: unknown,
                  ) => Promise<{ violations: { id: string }[] }>;
                };
              }
            ).axe.run(document.querySelector("main")!, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            })
          ).violations,
      );
      expect(violations.map((item) => item.id)).toEqual([]);
      await content.click();
      await page.screenshot({
        path: info.outputPath(`import-workspace-${locale}-${width}.png`),
        fullPage: true,
      });
    });
  }

test("package preparation, source inspection, approval and publication share one workspace", async ({
  page,
  request,
}) => {
  await request.post(`${mock}/__import_review`, { data: { submitted: true } });
  await signInAdmin(page);
  await page.goto("/admin/import");
  await page
    .getByRole("link", { name: "Constitution archive · 1946–1953" })
    .click();
  await page
    .getByRole("button", { name: "Prepare import", exact: true })
    .click();
  await expect(
    page
      .getByRole("heading", { name: "Archive charter · 1946", exact: true })
      .first(),
  ).toBeVisible();
  const toggle = page.getByRole("button", { name: "Hide package contents" });
  const firstTab = page.getByRole("tab", { name: "Content", exact: true });
  await expect(
    page.getByRole("tab", { name: "Review", exact: true }),
  ).toBeVisible();
  await expect(toggle.locator("svg rect")).toBeVisible();
  await expect
    .poll(async () => {
      const toggleBox = await toggle.boundingBox();
      const tabBox = await firstTab.boundingBox();
      return Boolean(toggleBox && tabBox && toggleBox.x < tabBox.x);
    })
    .toBe(true);
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page
    .getByLabel("Review reason")
    .fill("Checked the exact wording against the preserved archive.");
  await page.getByRole("button", { name: "Approve prepared draft" }).click();
  await expect(
    page.getByRole("button", { name: "Publish approved version" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish approved version" }).click();
  await expect(
    page.getByRole("link", { name: "Review next version" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review next version" }).click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page
    .getByLabel("Review reason")
    .fill("Checked the second version against the preserved archive.");
  await page.getByRole("button", { name: "Approve prepared draft" }).click();
  await page.getByRole("button", { name: "Publish approved version" }).click();
  await expect(
    page.getByRole("link", { name: "Open the published version" }),
  ).toBeVisible();
  const state = await (
    await request.get(`${mock}/api/ingestion/migration-runs/${run}`)
  ).json();
  expect(
    state.items.find((item: { kind: string }) => item.kind === "comparison")
      .state,
  ).toBe("prepared");
  await page.getByText("Sources · 2", { exact: true }).click();
  await page
    .locator("#import-package-contents")
    .getByRole("link", { name: /source-1946/ })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Approve prepared draft" }),
  ).toHaveCount(0);
  await page
    .getByRole("tab", { name: "Content", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "History", exact: true }),
  ).toBeFocused();
});

test("rejection retains one reason and requires explicit confirmation", async ({
  page,
  request,
}) => {
  await signInAdmin(page);
  await page.goto(href);
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page
    .getByLabel("Review reason")
    .fill("The captured source differs from the submitted wording.");
  await page
    .getByRole("button", { name: "Reject import", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "The captured source differs",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reject import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm rejection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish approved version" }),
  ).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(
              `${mock}/api/ingestion/import-jobs/01900000-0000-4000-8000-000000008630`,
            )
          ).json()
        ).status,
    )
    .toBe("rejected");
});
