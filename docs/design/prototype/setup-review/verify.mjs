import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const require = createRequire(
  new URL("../../../../apps/gateway-web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.argv[2] || "http://127.0.0.1:8766";
const output = process.argv[3] || "/workspace/artifacts/setup-review/shared";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium",
});
const results = [],
  errors = [];
try {
  for (const workflow of ["create", "settings", "proposal"])
    for (const language of ["de", "en"])
      for (const width of [390, 700, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}?page=${workflow}&lang=${language}`);
        await expect(page.locator("main h1")).toBeVisible();
        if (workflow === "create")
          await page
            .locator("#create-constitution-details [name=title]")
            .fill(
              language === "de" ? "Beispielverfassung" : "Example constitution",
            );
        const toolbar = page.getByRole("toolbar"),
          pane = page.locator("#setup-contents"),
          toggle = toolbar.getByRole("button").first();
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
          ["identity", "Angaben", "Details"],
          ["structure", "Struktur", "Structure"],
          ["documents", "Dokumente", "Documents"],
          ["review", "Prüfung", "Review"],
          ["history", "Verlauf", "History"],
        ]) {
          await page
            .getByRole("tab", {
              name: language === "de" ? de : en,
              exact: true,
            })
            .click();
          await expect(page.locator(`#setup-panel-${view}`)).toBeVisible();
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${workflow} ${language} ${width} ${view} overflows`,
          );
          if (view === "structure") {
            const sections = page.locator("[data-structure-grid]>section");
            const editor = await sections.first().boundingBox(),
              preview = await sections.last().boundingBox();
            assert(editor && preview);
            assert(
              width <= 1024
                ? preview.y >= editor.y + editor.height - 1
                : preview.x >= editor.x + editor.width - 1,
              "Settings and reading preview must not overlap",
            );
            assert(
              (
                await page
                  .getByLabel(
                    language === "de"
                      ? "Name in der Leseansicht"
                      : "Reader-facing name",
                    { exact: true },
                  )
                  .boundingBox()
              ).width >= 180,
              "Level fields must retain a usable width",
            );
          }
          await page.addScriptTag({ content: axe });
          const audit = await page.evaluate(() =>
            axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            }),
          );
          results.push({
            workflow,
            language,
            width,
            view,
            violations: audit.violations.map((item) => ({
              id: item.id,
              nodes: item.nodes.map((node) => node.target),
            })),
          });
          if (
            width !== 700 &&
            ["identity", "structure", "review"].includes(view)
          )
            await page.screenshot({
              path: `${output}/${workflow}-${view}-${language}-${width}.png`,
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
        await page
          .getByRole("tab", {
            name: language === "de" ? "Struktur" : "Structure",
            exact: true,
          })
          .click();
        await page.setViewportSize({ width, height: 600 });
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await expect
          .poll(async () =>
            Math.abs(
              (await toolbar.evaluate(
                (node) => node.parentElement.getBoundingClientRect().top,
              )) -
                (await page
                  .locator(".topbar")
                  .evaluate((node) => node.getBoundingClientRect().height)),
            ),
          )
          .toBeLessThanOrEqual(1);
        await page
          .getByRole("button", {
            name: language === "de" ? "Vorher" : "Before",
            exact: true,
          })
          .click();
        const image = page.locator("#before-content>img");
        await expect(image).toBeVisible();
        await expect
          .poll(() =>
            image.evaluate((node) => node.complete && node.naturalWidth > 0),
          )
          .toBe(true);
        assert(
          (await image.getAttribute("src")).startsWith(
            `before/${workflow}-de-`,
          ),
        );
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "Before comparison overflows",
        );
        await page
          .getByRole("button", {
            name: language === "de" ? "Entwurf" : "Mock",
            exact: true,
          })
          .click();
        await expect(page.getByRole("toolbar")).toBeVisible();
        await page.close();
      }
  await writeFile(
    `${output}/responsive-audit.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    `Responsive audit: ${results.length} views; ${results.filter((item) => item.violations.length).length} with axe violations.`,
  );
  assert.deepEqual(
    results.filter((item) => item.violations.length),
    [],
  );
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on("pageerror", (error) => errors.push(error.message));
  await p.goto(`${base}?page=create&lang=en`);
  await p.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(
    p.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await p
    .locator("#create-constitution-details [name=title]")
    .fill("A retained creation draft");
  await p
    .getByRole("button", { name: "Continue to structure", exact: true })
    .click();
  await p.getByRole("button", { name: "Choose template", exact: true }).click();
  await p.getByRole("button", { name: /Articles and sentences/ }).click();
  await p.getByRole("button", { name: "New level", exact: true }).click();
  await p.getByLabel("Reader-facing name", { exact: true }).fill("Appendix");
  await p.getByRole("tab", { name: "Review", exact: true }).click();
  await p
    .locator("#setup-panel-review")
    .getByRole("button", { name: "Create constitution", exact: true })
    .click();
  await expect(p.locator("main")).toContainText(
    "Constitution and initial structure created in this mock.",
  );
  await p
    .getByRole("group", { name: "Page", exact: true })
    .getByRole("button", { name: "Existing settings", exact: true })
    .click();
  await p.getByLabel("Reader-facing name", { exact: true }).fill("Art.");
  await p.getByRole("tab", { name: "Review", exact: true }).click();
  const save = p.getByRole("button", { name: "Save settings", exact: true });
  await expect(save).toBeDisabled();
  await p.getByRole("button", { name: "Check impact", exact: true }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(p.locator("main")).toContainText(
    "New example settings revision saved.",
  );
  await p.getByRole("tab", { name: "Structure", exact: true }).click();
  await p.getByRole("button", { name: "New level", exact: true }).click();
  await p.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(save).toBeDisabled();
  await p.getByRole("button", { name: "Check impact", exact: true }).click();
  await expect(save).toBeDisabled();
  await expect(p.locator("#setup-panel-review")).toContainText(
    "Direct saving is blocked.",
  );
  await p.getByRole("tab", { name: "History", exact: true }).click();
  await p
    .getByRole("button", { name: "Restore as draft", exact: true })
    .click();
  await expect(save).toBeDisabled();
  await p.getByRole("tab", { name: "Documents", exact: true }).click();
  const constitution = p.locator("[data-evidence-owner=constitution]");
  await constitution
    .getByRole("button", { name: "Choose existing document", exact: true })
    .click();
  const search = constitution.getByRole("combobox", {
    name: "Search documents",
    exact: true,
  });
  await search.fill("Gliederung");
  await search.press("ArrowDown");
  await search.press("Enter");
  await constitution.getByText("Citation options", { exact: true }).click();
  await constitution
    .getByLabel("Revision to cite", { exact: true })
    .selectOption("structure-r1");
  await constitution
    .getByText("Citation note / relevant passage", { exact: true })
    .click();
  await constitution
    .getByLabel("Note for this constitution", { exact: true })
    .fill("Constitution-specific evidence note.");
  await constitution
    .getByRole("button", { name: "Attach document", exact: true })
    .click();
  await p
    .getByRole("group", { name: "Page", exact: true })
    .getByRole("button", { name: "Import setup review", exact: true })
    .click();
  await p.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "New level", exact: true }),
  ).toHaveCount(0);
  await p.getByLabel("Reader-facing name", { exact: true }).fill("Article");
  await p.getByRole("tab", { name: "Review", exact: true }).click();
  await p.getByText("Something needs correcting?", { exact: true }).click();
  const reason = p.getByLabel("Requested changes", { exact: true });
  await reason.fill(
    "Please verify the source reference and the proposed hierarchy.",
  );
  await p.getByRole("tab", { name: "Documents", exact: true }).click();
  const proposal = p.locator("[data-evidence-owner=setup_proposal]");
  await expect(proposal).not.toContainText(
    "Constitution-specific evidence note.",
  );
  await proposal
    .getByRole("button", { name: "Upload new document", exact: true })
    .click();
  await proposal
    .getByLabel("Title", { exact: true })
    .fill("Retained upload draft");
  await proposal
    .getByLabel("File", { exact: true })
    .setInputFiles({
      name: "sample-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Local sample only"),
    });
  await p.getByRole("button", { name: "Before", exact: true }).click();
  await p.getByRole("button", { name: "Mock", exact: true }).click();
  await p
    .getByRole("group", { name: "Page", exact: true })
    .getByRole("button", { name: "Create constitution", exact: true })
    .click();
  await p.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(
    p.locator("#create-constitution-details [name=title]"),
  ).toHaveValue("A retained creation draft");
  await p
    .getByRole("group", { name: "Page", exact: true })
    .getByRole("button", { name: "Import setup review", exact: true })
    .click();
  await expect(proposal.getByLabel("Title", { exact: true })).toHaveValue(
    "Retained upload draft",
  );
  await expect
    .poll(() =>
      proposal
        .getByLabel("File", { exact: true })
        .evaluate((node) => node.files[0]?.name),
    )
    .toBe("sample-note.txt");
  await p.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(reason).toHaveValue(
    "Please verify the source reference and the proposed hierarchy.",
  );
  await p.getByRole("button", { name: "Request changes", exact: true }).click();
  const confirm = p.getByRole("button", { name: "Confirm setup", exact: true });
  await expect(confirm).toBeDisabled();
  await p
    .getByRole("button", { name: "Load revised example", exact: true })
    .click();
  await confirm.click();
  await expect(p.locator("main")).toContainText(
    "Constitution and structure created.",
  );
  await p.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(
    p.getByLabel("Reader-facing name", { exact: true }),
  ).toBeDisabled();
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        views: results.length,
        errors,
        interactions:
          "creation validation and templates; safe settings save and migration block; restore as draft; owner-scoped evidence and immutable pins; retained creation, review and upload drafts across pages and before/mock toggles; confirmation",
      },
      null,
      2,
    ),
  );
  await p.close();
  console.log(
    "PASS: all three workspaces, before screenshots, native creation validation, impact gates, immutable evidence pins, draft preservation and confirmation.",
  );
} finally {
  await browser.close();
}
