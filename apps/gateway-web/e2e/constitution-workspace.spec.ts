import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures/consent";
import { signInAdmin } from "./helpers";

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const owners = [
  { name: "create", url: "/admin/constitutions" },
  {
    name: "settings",
    url: "/admin/constitutions/01900000-0000-4000-8000-000000000002",
  },
  {
    name: "proposal",
    url: "/admin/import/setup/01900000-0000-4000-8000-000000000802",
  },
];

for (const locale of ["en", "de"])
  test(`all constitution owners share usable tabs, fields and chrome in ${locale}`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    await request.post(`${mock}/__reset`);
    await request.post(`${mock}/__sprint59_content`);
    await signInAdmin(page);
    await request.put(`${mock}/api/identity/me/language`, {
      headers: { Authorization: "Bearer e2e-session-token" },
      data: { languagePreference: locale },
    });
    await page.setExtraHTTPHeaders({ "Accept-Language": locale });
    for (const width of [1440, 820, 390])
      for (const owner of owners) {
        await auditOwner(page, owner, width, locale, testInfo);
      }
  });

async function auditOwner(
  page: Page,
  owner: (typeof owners)[number],
  width: number,
  locale: string,
  testInfo: TestInfo,
) {
  const de = locale === "de";
  const labels = de
    ? ["Angaben", "Struktur", "Dokumente", "Prüfung", "Verlauf"]
    : ["Details", "Structure", "Documents", "Review", "History"];
  await page.setViewportSize({ width, height: 950 });
  await page.goto(owner.url);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(5);
  const toolbar = page.getByRole("toolbar");
  const box = await toolbar.boundingBox();
  expect(box!.x).toBe(0);
  expect(box!.width).toBe(width);
  if (owner.name === "create")
    await page
      .getByLabel(de ? "Verfassungstitel" : "Constitution title")
      .fill("Draft charter");
  await page.addScriptTag({
    path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
  });
  for (const label of labels) {
    const tab = page.getByRole("tab", { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tabpanel").filter({ visible: true }),
    ).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    // @ts-expect-error axe is injected into the real page
    const violations = await page.evaluate(
      async () => (await window.axe.run(document)).violations,
    );
    expect(violations, `${owner.name} ${locale} ${width} ${label}`).toEqual([]);
    if (label === labels[1]) {
      const field = page.getByRole("textbox", {
        name: de ? "Name in der Leseansicht" : "Reader-facing name",
        exact: true,
      });
      await expect(field).toBeVisible();
      const fieldBox = await field.boundingBox();
      expect(fieldBox!.width).toBeGreaterThan(200);
      const editor = page.getByRole("region", {
        name: / (Structure|Struktur)$/,
      });
      const preview = page.getByRole("region", {
        name: de ? "Vorschau des Lesers" : "Reader preview",
        exact: true,
      });
      const a = await editor.boundingBox(),
        b = await preview.boundingBox();
      expect(a!.x + a!.width <= b!.x + 1 || a!.y + a!.height <= b!.y + 1).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`${owner.name}-${locale}-${width}.png`),
        fullPage: true,
      });
    }
  }
}

test("document uploads retain their file and title while settings, history and overview change", async ({
  page,
  request,
}) => {
  await request.post(`${mock}/__reset`);
  await request.post(`${mock}/__sprint59_content`);
  await signInAdmin(page);
  for (const owner of owners.filter((value) => value.name !== "create")) {
    await page.goto(owner.url);
    await page.getByRole("tab", { name: "Documents", exact: true }).click();
    await page
      .getByRole("button", { name: "Upload new document", exact: true })
      .click();
    const file = page.getByLabel("File", { exact: true });
    await file.setInputFiles({
      name: "unfinished-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("An unsaved supplementary source"),
    });
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    await title.fill("Unfinished attachment");
    expect(
      await title.evaluate((element) => (element as HTMLInputElement).form),
    ).toBeNull();
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page
      .getByRole("button", { name: "Hide overview", exact: true })
      .click();
    await page.getByRole("tab", { name: "Structure", exact: true }).click();
    await page.getByRole("tab", { name: "Documents", exact: true }).click();
    await expect(title).toHaveValue("Unfinished attachment");
    expect(
      await file.evaluate(
        (element) => (element as HTMLInputElement).files?.[0]?.name,
      ),
    ).toBe("unfinished-evidence.txt");
    expect(await page.locator("form form").count()).toBe(0);
  }
});
