import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const require = createRequire(
  new URL("../../../../apps/gateway-web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.argv[2] || "http://127.0.0.1:8766";
const output = process.argv[3] || "/workspace/artifacts/setup-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium",
});
const results = [],
  errors = [];
try {
  for (const language of ["de", "en"])
    for (const width of [390, 700, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}?lang=${language}`);
      await expect(page.locator("main h1")).toBeVisible();
      const toolbar = page.getByRole("toolbar"),
        pane = page.locator("#setup-contents");
      const toggle = toolbar.getByRole("button").first();
      await expect(pane).toBeVisible({ visible: width > 680 });
      await toggle.click();
      await expect(pane).toBeVisible({ visible: width <= 680 });
      await toggle.click();
      assert.equal(
        await toolbar.evaluate(
          (node) => node.parentElement.getBoundingClientRect().width,
        ),
        width,
      );
      assert.equal(
        await page
          .locator(".page-header")
          .evaluate((node) => getComputedStyle(node).borderBottomWidth),
        "0px",
      );
      assert.equal(
        await toolbar.evaluate(
          (node) => getComputedStyle(node.parentElement).borderBottomWidth,
        ),
        "1px",
      );
      for (const [view, de, en] of [
        ["proposal", "Vorschlag", "Proposal"],
        ["structure", "Struktur", "Structure"],
        ["documents", "Dokumente", "Documents"],
        ["review", "Prüfung", "Review"],
        ["history", "Verlauf", "History"],
      ]) {
        await page
          .getByRole("tab", { name: language === "de" ? de : en, exact: true })
          .click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${language} ${width} ${view} overflows`,
        );
        await page.addScriptTag({ content: axe });
        const audit = await page.evaluate(() =>
          axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
        );
        results.push({
          language,
          width,
          view,
          violations: audit.violations.map((item) => ({
            id: item.id,
            nodes: item.nodes.map((node) => node.target),
          })),
        });
        if (width !== 700 && ["proposal", "structure", "review"].includes(view))
          await page.screenshot({
            path: `${output}/${view}-${language}-${width}.png`,
            fullPage: true,
          });
      }
      const first = page.getByRole("tab").first();
      await first.focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("tab", {
          name: language === "de" ? "Struktur" : "Structure",
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press("End");
      await expect(page.getByRole("tab").last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(first).toBeFocused();
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      assert(
        Math.abs(
          (await toolbar.evaluate(
            (node) => node.parentElement.getBoundingClientRect().top,
          )) -
            (await page
              .locator(".topbar")
              .evaluate((node) => node.getBoundingClientRect().height)),
        ) <= 1,
        "Toolbar must stay below the site header",
      );
      await page.close();
    }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?lang=en`);
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  const name = page.getByLabel("Reader-facing name", { exact: true });
  await name.fill("Art.");
  await expect(page.locator("#setup-panel-structure")).toContainText("Art. 1");
  await page.getByRole("button", { name: "Save display", exact: true }).click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByText("Something needs correcting?", { exact: true }).click();
  const reason = page.getByLabel("Requested changes", { exact: true });
  await reason.fill(
    "Please verify the source reference and the chapter hierarchy.",
  );
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose existing document", exact: true })
    .click();
  const search = page.getByRole("combobox", {
    name: "Search documents",
    exact: true,
  });
  await search.fill("Gliederung");
  await search.press("ArrowDown");
  await search.press("Enter");
  await page.getByText("Citation options", { exact: true }).click();
  await page
    .getByLabel("Revision to cite", { exact: true })
    .selectOption("structure-r1");
  await page
    .getByText("Citation note / relevant passage", { exact: true })
    .click();
  await page
    .getByLabel("Note for this proposal", { exact: true })
    .fill("Pages 2–3 explain the proposed hierarchy.");
  await page
    .getByRole("button", { name: "Attach document", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: "Hinweise zur Gliederung des Grundgesetzes",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Cited revision 1");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(reason).toHaveValue(
    "Please verify the source reference and the chapter hierarchy.",
  );
  await page
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm setup", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Load revised example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm setup", exact: true })
    .click();
  await expect(page.locator("main")).toContainText(
    "Constitution and structure created.",
  );
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(name).toBeDisabled();
  await expect(name).toHaveValue("Art.");
  await page.close();
  const violations = results.filter((result) => result.violations.length);
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        results,
        errors,
        interactions:
          "pane toggles, sticky toolbar, tab keyboard navigation, live display preview, pinned evidence and scoped notes, preserved drafts, request changes, confirmation and read-only state",
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(violations, []);
  console.log(
    `PASS: ${results.length} bilingual responsive views; axe, pane toggles, sticky toolbar, keyboard tabs, live preview and review/evidence journey.`,
  );
} finally {
  await browser.close();
}
