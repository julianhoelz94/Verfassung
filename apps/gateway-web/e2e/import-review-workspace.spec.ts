import { test, expect } from "./fixtures/consent";
import { signInAdmin, VERSION_2022 } from "./helpers";
import { readFileSync } from "node:fs";

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const run = "01900000-0000-4000-8000-000000008500";
const href = `/admin/import/packages/${run}`;
test.beforeEach(async ({ request }) => {
  await request.post(`${mock}/__reset`);
  await request.post(`${mock}/__import_review`, { data: {} });
  await request.post(`${mock}/__editor_documents`);
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
      const primary = page.locator('.nav-primary');
      const imports = primary.locator('a[href="/admin/import"]');
      await expect(imports).toHaveText(en ? 'Imports' : 'Importe');
      await expect(imports).toHaveAttribute('aria-current', 'page');
      await expect(primary.locator('[aria-current="page"]')).toHaveCount(1);
      const destinations = await primary.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      expect(destinations.slice(destinations.indexOf('/editor'), destinations.indexOf('/documents') + 1)).toEqual(['/editor', '/admin/import', '/documents']);
      if (width === 390) {
        await page.getByRole('button', { name: en ? 'Account menu' : 'Kontomenü', exact: true }).click();
        const mobileImports = page.locator('.menu-panel').getByRole('link', { name: en ? 'Imports' : 'Importe', exact: true });
        await expect(mobileImports).toBeVisible();
        await expect(mobileImports).toHaveAttribute('aria-current', 'page');
        await page.keyboard.press('Escape');
      }
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
      const toolbar = page.getByRole("toolbar");
      const appearance = await toolbarAppearance(toolbar);
      expect(appearance.left).toBe(0);
      expect(appearance.width).toBe(width);
      const decision = page.getByRole("button", {
        name: en ? "Make review decision" : "Entscheidung treffen",
        exact: true,
      });
      await expect(decision.locator("svg")).toBeVisible();
      expect(
        await decision.evaluate((button) => {
          const label = button.querySelector("span")!.getBoundingClientRect();
          const icon = button.querySelector("svg")!.getBoundingClientRect();
          return Math.abs(
            label.y + label.height / 2 - icon.y - icon.height / 2,
          );
        }),
      ).toBeLessThan(1);
      const viewer = await page.context().newPage();
      try {
        await viewer.setViewportSize({ width, height: 1000 });
        await viewer.goto(`/countries/DE/versions/${VERSION_2022}`);
        await expect(viewer.getByRole("toolbar")).toBeVisible();
        expect(await toolbarAppearance(viewer.getByRole("toolbar"))).toEqual(
          appearance,
        );
      } finally {
        await viewer.close();
      }
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
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({
        path: info.outputPath(`import-workspace-${locale}-${width}.png`),
        fullPage: true,
      });
    });
  }

async function toolbarAppearance(toolbar: import("@playwright/test").Locator) {
  return toolbar.evaluate((element) => {
    const bar = getComputedStyle(element);
    const frame = getComputedStyle(element.parentElement!);
    const active = element.querySelector(
      '[role="tab"][aria-selected="true"], button[aria-pressed="true"]',
    )!;
    const button = getComputedStyle(active);
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.x,
      width: bounds.width,
      height: bounds.height,
      padding: bar.padding,
      gap: bar.gap,
      wrap: bar.flexWrap,
      background: frame.backgroundColor,
      border: frame.borderBottom,
      font: button.font,
      buttonPadding: button.padding,
      buttonHeight: active.getBoundingClientRect().height,
      buttonRadius: button.borderRadius,
      buttonBackground: button.backgroundColor,
      buttonColor: button.color,
      labelDisplay: getComputedStyle(active.querySelector("span")!).display,
    };
  });
}

for (const width of [1024, 1152]) {
  test(`Imports remains reachable without header overflow at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAdmin(page);
    await request.put(`${mock}/api/identity/me/language`, {
      headers: { Authorization: 'Bearer e2e-session-token' },
      data: { languagePreference: 'de' },
    });
    await page.goto('/admin/import');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const primary = page.locator('.nav-primary');
    if (await primary.isVisible()) {
      await expect(primary.getByRole('link', { name: 'Importe', exact: true })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Kontomenü', exact: true }).click();
      await expect(page.locator('.menu-panel').getByRole('link', { name: 'Importe', exact: true })).toBeVisible();
    }
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
  await expect(page.getByRole("heading", { name: "Archive charter · 1953", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Content", exact: true })).toHaveAttribute("aria-selected", "true");
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
