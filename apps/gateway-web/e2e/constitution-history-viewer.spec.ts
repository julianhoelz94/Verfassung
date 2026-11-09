import { expect, test } from "./fixtures/consent";
import { signInAdmin, signInPublisher, VERSION_1949, VERSION_2022 } from "./helpers";
import path from "node:path";
const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const base = "/countries/DE/constitutions/01900000-0000-4000-8000-000000000002";
const amendment = base + "/amendments/01900000-0000-4000-8000-000000000301";
const event = base + "/events/01900000-0000-4000-8000-000000000731";
test.beforeEach(async ({ request }) => {
  await request.post(mock + "/__reset");
  await request.post(mock + "/__sprint50_content");
});

for (const locale of ["en", "de"])
  for (const width of [390, 1440])
    test(`timeline grouping and compact preferences in ${locale} at ${width}px`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({locale, viewport: {width, height: 1000}});
      await context.addInitScript(() => localStorage.setItem("ca_cookie_notice_v1", "dismissed"));
      const page = await context.newPage();
      try {
        await page.goto(base);
        const year = page.getByRole("region", {name: "2022", exact: true});
        await expect(year.locator('article[data-kind="version"]')).toHaveCount(1);
        await expect(year.locator('article[data-kind="amendment"]')).toHaveCount(1);
        const rail = year.locator(":scope > div").first().locator("span");
        await expect(rail).toBeVisible();
        expect((await rail.boundingBox())!.height).toBeGreaterThan(40);
        const menu = page.getByRole("navigation", {name: locale === "en" ? "Constitution viewer" : "Verfassungsansicht"});
        for (const control of [menu.getByRole("button", {name: locale === "en" ? "Contents" : "Inhalt", exact: true}), menu.getByRole("link", {name: locale === "en" ? "History" : "Geschichte", exact: true})])
          await expect(control).toHaveCSS("box-shadow", "none");
        await page.screenshot({path: testInfo.outputPath(`history-${locale}-${width}.png`), fullPage: true});
        const preferencesName = locale === "en" ? "Reading preferences" : "Leseeinstellungen";
        await menu.getByRole("button", {name: preferencesName, exact: true}).click();
        const recordPreferences = page.locator("#constitution-preferences");
        await expect(recordPreferences).toBeVisible();
        expect((await recordPreferences.boundingBox())!.width).toBeLessThanOrEqual(310);
        await expect(recordPreferences.getByRole("combobox", {name: locale === "en" ? "Text size" : "Textgröße", exact: true})).toBeVisible();
        await page.locator("h1").click();
        await expect(recordPreferences).toBeHidden();
        await menu.getByRole("button", {name: preferencesName, exact: true}).click();
        await page.keyboard.press("Escape");
        await expect(recordPreferences).toBeHidden();
        await expect(menu.getByRole("button", {name: preferencesName, exact: true})).toBeFocused();
        await page.goto(`/countries/DE/versions/${VERSION_1949}`);
        await page.getByRole("button", {name: locale === "en" ? "Reading preferences" : "Leseeinstellungen", exact: true}).click();
        const indent = page.getByRole("checkbox", {name: locale === "en" ? "Show indentation" : "Einrückung anzeigen", exact: true});
        await indent.check();
        const box = (await indent.boundingBox())!;
        const label = (await indent.locator("..").locator("span").boundingBox())!;
        expect(label.x).toBeGreaterThan(box.x + box.width);
        expect(Math.abs((label.y + label.height / 2) - (box.y + box.height / 2))).toBeLessThan(3);
        await expect(indent.locator("..")).toHaveCSS("margin-top", "0px");
        await expect(page.getByRole("combobox", {name: locale === "en" ? "Text size" : "Textgröße", exact: true})).toBeVisible();
        await page.locator('[data-reader-menu][open] > div').screenshot({path: testInfo.outputPath(`preferences-${locale}-${width}.png`)});
        await page.addScriptTag({path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js")});
        const violations = await page.evaluate(async () => {
          // @ts-expect-error injected test audit
          return (await window.axe.run(document)).violations.map((item) => item.id);
        });
        expect(violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.keyboard.press("Escape");
        await expect(indent).toBeHidden();
      } finally { await context.close(); }
    });

for (const width of [390, 844, 1440])
  test(`shared record and History navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const href of [amendment, event]) {
      await page.goto(href);
      const menu = page.getByRole("navigation", {
        name: "Constitution viewer",
        exact: true,
      });
      await expect(
        menu.getByRole("link", { name: "Read", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        menu.getByRole("link", { name: "History", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /^Edit (amendment|lifecycle event)$/ }),
      ).toHaveCount(0);
      await menu.getByRole("button", { name: "Contents", exact: true }).click();
      await expect(page.locator("#constitution-contents")).toBeHidden();
      await menu.getByRole("button", { name: "Contents", exact: true }).click();
      await expect(page.locator("#constitution-contents")).toBeVisible();
      await menu.getByRole("link", { name: "History", exact: true }).click();
      await expect(
        page.getByText(
          "Last viewed · " +
            (href === amendment ? "Amendment" : "Lifecycle event"),
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.locator("article[aria-current=true]")).toHaveCount(1);
      await page.getByRole("link", { name: /^← Back to / }).click();
      await expect(page).toHaveURL(href);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.addScriptTag({
        path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
      });
      const violations = await page.evaluate(async () => {
        // @ts-expect-error injected test audit
        return (await window.axe.run(document)).violations.map((v) => v.id);
      });
      expect(violations).toEqual([]);
    }
  });

test('a full constitution Wiki preserves the legal version it was opened from',async({page})=>{
  await page.goto(`/countries/DE/versions/${VERSION_1949}`);
  await page.getByRole('button',{name:'Wiki',exact:true}).click();
  await page.getByRole('link',{name:'Open constitution Wiki',exact:true}).click();
  const read=page.getByRole('navigation',{name:'Constitution viewer',exact:true}).getByRole('link',{name:'Read',exact:true});
  await expect(read).toHaveAttribute('href',`/countries/DE/versions/${VERSION_1949}`);
  await read.click();await expect(page).toHaveURL(`/countries/DE/versions/${VERSION_1949}`);
});

test("History collapses comparison controls and restores the last compared range", async ({
  page,
}) => {
  await page.goto(`/countries/DE/versions/${VERSION_1949}`);
  await page.getByRole("link", { name: "History", exact: true }).click();
  const comparison = page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "Compare legal versions" }),
    });
  await expect(comparison.locator("select").first()).toBeHidden();
  await comparison.locator("summary").click();
  await page.getByRole("button", { name: /^Compare versions/ }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Constitution viewer" })
      .getByRole("link", { name: "Compare", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "1949 → 2022", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Last viewed · Comparison", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("article[aria-current=true]")).toHaveCount(0);
  await expect(
    page.getByText("Comparison start", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Comparison end", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("link", { name: "← Back to Comparison", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`from=${VERSION_1949}.*to=${VERSION_2022}`),
  );
});

test("passage history returns to the exact source viewer", async ({ page }) => {
  await page.goto(`/countries/DE/versions/${VERSION_1949}`);
  const passage = page
    .getByRole("link", { name: "History of this passage", exact: true })
    .first();
  await passage.click();
  await expect(
    page.getByRole("heading", { name: "History of this passage", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "← Back to viewer", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/versions/${VERSION_1949}#unit-`));
});

test("authorized editors add persisted commentary separately to the act and changed passage", async ({
  page,
  request,
}) => {
  await request.post(mock + "/__editor_documents");
  await signInAdmin(page);
  await page.goto(amendment);
  await expect(
    page.getByRole("link", { name: "Edit amendment", exact: true }),
  ).toBeVisible();
  const materials = page.locator("#amendment-materials");
  await materials
    .getByText("Add commentary", { exact: true })
    .click();
  await materials
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Background to this act");
  await materials
    .getByRole("textbox", { name: "Commentary", exact: true })
    .fill("This comment is about the amendment as a whole.");
  await materials
    .getByRole("button", { name: "Save and publish material", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Background to this act", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(materials.locator("article p").first()).toHaveText(
    "This comment is about the amendment as a whole.",
  );
  const changeMaterials = page.locator(
    "[data-material-target=change_material]",
  );
  await expect(
    changeMaterials.getByRole("link", {
      name: "Background to this act",
      exact: true,
    }),
  ).toHaveCount(0);
  await changeMaterials
    .getByText("Add commentary", { exact: true })
    .click();
  await changeMaterials
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Passage context");
  await changeMaterials
    .getByRole("textbox", { name: "Commentary", exact: true })
    .fill("About just this change.");
  await changeMaterials
    .getByRole("button", { name: "Save and publish material", exact: true })
    .click();
  await expect(
    changeMaterials.getByRole("link", {
      name: "Passage context",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(changeMaterials.locator("article p").first()).toHaveText(
    "About just this change.",
  );
  await page.goto(event);
  await expect(
    page.getByRole("link", { name: "Edit lifecycle event", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit lifecycle event", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit event evidence", exact: true }),
  ).toBeVisible();
});


test('reuses one source with different passage notes and lets publishers attach event evidence without upload rights', async ({page,request}) => {
  await request.post(mock + '/__editor_documents');
  await signInAdmin(page); await page.goto(amendment);
  const act = page.locator('#amendment-materials');
  await act.getByRole('button',{name:'Upload new document',exact:true}).click();
  await act.getByRole('textbox',{name:'Title',exact:true}).fill('Shared gazette source');
  await act.getByText('Optional details',{exact:true}).click();
  await act.getByRole('textbox',{name:'Source URL',exact:true}).fill('https://example.org/gazette');
  await act.getByRole('button',{name:'Create and attach',exact:true}).click();
  const actSource = act.getByRole('link',{name:'Shared gazette source',exact:true});
  await expect(actSource).toBeVisible(); const pin = await actSource.getAttribute('href');
  const change = page.locator('[data-material-target=change_material]').first();
  await change.getByRole('button',{name:'Choose existing document',exact:true}).click();
  const search = change.getByRole('combobox',{name:'Search documents',exact:true});
  await search.fill('Shared gazette');
  await expect(change.getByRole('listbox')).toHaveAttribute('aria-busy','false');
  await change.getByRole('option',{name:/Shared gazette source/}).click();
  await change.getByText('Citation note / relevant passage',{exact:true}).click();
  await change.getByRole('textbox',{name:'Note for this attachment',exact:true}).fill('Chapter 3 explains this change.');
  await change.getByRole('button',{name:'Attach document',exact:true}).click();
  await expect(change.getByText('Chapter 3 explains this change.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(change.getByRole('link',{name:'Shared gazette source',exact:true})).toHaveAttribute('href',pin!);
  await expect(change.getByText('Chapter 3 explains this change.',{exact:true})).toBeVisible();
  await expect(act.getByText('Chapter 3 explains this change.',{exact:true})).toHaveCount(0);
  await page.context().clearCookies();
  await signInPublisher(page); await page.goto(event);
  const eventMaterials=page.locator('#event-materials');
  await expect(eventMaterials.getByRole('button',{name:'Upload new document',exact:true})).toHaveCount(0);
  await eventMaterials.getByRole('button',{name:'Choose existing document',exact:true}).click();
  await eventMaterials.getByRole('combobox',{name:'Search documents',exact:true}).fill('Shared gazette');
  await expect(eventMaterials.getByRole('listbox')).toHaveAttribute('aria-busy','false');
  await eventMaterials.getByRole('option',{name:/Shared gazette source/}).click();
  await eventMaterials.getByRole('button',{name:'Attach document',exact:true}).click();
  await page.reload();
  await expect(eventMaterials.getByRole('link',{name:'Shared gazette source',exact:true})).toHaveAttribute('href',pin!);
});
