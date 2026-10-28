import { expect, test } from './fixtures/consent';
import { VERSION_2022, VERSION_1949 } from './helpers';
import { continuousReaderUnits } from './fixtures/continuous-reader.mjs';
const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const href = `/countries/DE/versions/${VERSION_2022}`;
const units = continuousReaderUnits(VERSION_2022);
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__continuous_reader`)).ok()).toBeTruthy();
});
for (const width of [390,820,1440]) {
  test(`toolbar, contents and bottom footnote remain reachable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({width,height:900}); await page.goto(href);
    const toolbar = page.getByRole('toolbar'); const contents = page.getByRole('navigation',{name:'Contents',exact:true});
    await expect(page.locator('strong').first()).toBeVisible();
    await page.locator(`[id="unit-${units[19].id}"]`).scrollIntoViewIfNeeded();
    await expect.poll(async()=> (await toolbar.boundingBox())?.y).toBeGreaterThanOrEqual(0);
    const headerBottom = await page.locator('.topbar').evaluate(node=>node.getBoundingClientRect().bottom);
    expect((await toolbar.boundingBox())!.y).toBeCloseTo(headerBottom,0);
    const nav = (await contents.boundingBox())!; expect(nav.y).toBeGreaterThanOrEqual(headerBottom); expect(nav.y+nav.height).toBeLessThan(901);
    await expect(contents.locator('a[aria-current="true"]')).toBeInViewport();
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth',width);
    const marker = page.getByRole('button',{name:'Show footnote *'}).last(); await marker.scrollIntoViewIfNeeded();
    const before = await page.evaluate(()=>scrollY); await marker.click();
    const drawer = page.getByRole('dialog',{name:'Footnote *'}); await expect(drawer).toBeVisible();
    expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(2);
    const box=(await drawer.boundingBox())!; expect(box.y+box.height).toBeLessThan(900); expect(box.y+box.height).toBeGreaterThan(850);
    await page.screenshot({path:testInfo.outputPath(`reader-drawer-${width}.png`)});
    await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(marker).toBeFocused();
    await marker.click(); await page.getByRole('link',{name:'Go to footnote',exact:true}).click(); await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('note')).toBeInViewport();
    await expect(page.getByRole('note').getByRole('link')).toHaveCount(2);
    await page.getByRole('note').getByRole('link').first().click(); await expect(page.getByRole('button',{name:'Show footnote *'}).first()).toBeInViewport();
  });
}
for (const width of [390,1440]) test(`contents can be hidden without losing the current passage at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900}); await page.goto(href);
  const target=page.locator(`[id="unit-${units[12].id}"]`); await target.scrollIntoViewIfNeeded();
  const before=(await target.boundingBox())!.y; await page.getByRole('button',{name:'Hide table of contents'}).click();
  await expect(page.getByRole('navigation',{name:'Contents',exact:true})).toHaveCount(0);
  expect(Math.abs((await target.boundingBox())!.y-before)).toBeLessThan(4);
  await page.reload(); await expect(page.getByRole('button',{name:'Show table of contents'})).toBeVisible();
});
test('comparison uses explicit publication selectors, real diffs, swaps and shares the panel with Wiki',async({page},testInfo)=>{
  await page.goto(href); await page.getByRole('button',{name:'Compare',exact:true}).click();
  const panel=page.getByRole('region',{name:'Compare publications',exact:true});
  await expect(panel.getByRole('combobox',{name:'From',exact:true})).toHaveValue(VERSION_1949);
  await expect(panel.getByRole('combobox',{name:'To',exact:true})).toHaveValue(VERSION_2022);
  await expect(panel.locator('ins')).toContainText('equal');
  await expect(panel.getByRole('link',{name:'Go to changed passage'})).toHaveAttribute('href','#unit-'+units[0].id);
  await panel.getByRole('button',{name:'Swap publications'}).click(); await expect(panel.locator('del')).toContainText('equal');
  await page.screenshot({path:testInfo.outputPath('reader-comparison.png')});
  await page.getByRole('button',{name:'Wiki',exact:true}).click(); await expect(panel).toBeHidden();
  const wiki=page.getByRole('region',{name:'Wiki',exact:true}); await expect(wiki.getByRole('heading',{name:'About this constitution'})).toBeVisible();
  await expect(wiki.getByRole('link',{name:'Open constitution overview'})).toBeVisible();
  await page.getByRole('button',{name:'Compare',exact:true}).click(); await expect(wiki).toHaveCount(0);
  await expect(panel.getByRole('combobox',{name:'From',exact:true})).toHaveValue(VERSION_2022);
  await panel.getByRole('combobox',{name:'To',exact:true}).selectOption(VERSION_2022); await expect(panel.getByText('No differences',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Details',exact:true}).click(); await expect(page.getByText('Editorial snapshot',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'Details',exact:true})).toBeFocused();
});
test('find spans formatting, sentence layout preserves exact text and keyboard controls close panels',async({page})=>{
  await page.goto(href); await page.getByRole('button',{name:'Find in text'}).click();
  const input=page.getByRole('searchbox',{name:'Find in constitution'}); await expect(input).toBeFocused(); await input.fill('Every person');
  await expect(page.getByRole('status').filter({hasText:'1 of 1 matches'})).toBeVisible();
  await input.fill('rights'); await expect(page.getByRole('button',{name:'Next match'})).toBeEnabled(); await page.getByRole('button',{name:'Next match'}).click();
  await page.getByRole('button',{name:'Close search'}).click();
  const source = page.locator(`[id="${units[19].content[0].node.content[1].node.content[0].occurrenceId}"]`); const wording=await source.textContent();
  await page.getByRole('button',{name:'Reading preferences'}).click();
  await page.getByRole('combobox',{name:'Sentence presentation'}).selectOption('lines'); await page.getByRole('combobox',{name:'Text size'}).selectOption('20'); await page.keyboard.press('Escape');
  await expect(source).toHaveText(wording!); expect(wording).toContain('\n'); await expect(page.locator('strong').first()).toHaveText('Every');
});
test('a narrow zoomed viewport keeps all controls usable and source text in the server response',async({page,request})=>{
  await page.setViewportSize({width:320,height:700}); await page.goto(href); await page.getByRole('button',{name:'Compare',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'From',exact:true})).toBeVisible(); await expect(page.locator('html')).toHaveJSProperty('scrollWidth',320);
  const html=await (await request.get(href)).text(); expect(html).toContain('The legislature meets in public.'); expect(html).toContain('A constitution-wide source note.');
});
test('footnote preview, drawer and comparison retain accessible names and dismiss without a jump',async({page})=>{
  await page.goto(href); const marker=page.getByRole('button',{name:'Show footnote *'}).first();
  await marker.hover(); await expect(page.getByRole('tooltip')).toContainText('A constitution-wide source note.');
  await marker.click(); await expect(page.getByRole('tooltip')).toHaveCount(0);
  const position=await page.evaluate(()=>scrollY); await page.getByRole('button',{name:'Close footnote'}).click(); expect(await page.evaluate(()=>scrollY)).toBe(position);
  await marker.click(); await page.getByRole('heading',{level:1}).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Compare',exact:true}).click();
  await expect(page.locator('#reader-compare ins')).toBeVisible();
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const violations=await page.evaluate(async()=>{
    // @ts-expect-error axe is loaded for this browser check.
    return (await window.axe.run(document)).violations;
  });
  expect(violations).toEqual([]);
});

test('the global phone menu stays above the sticky reading controls',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto(href);
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  const section=page.locator('.menu-panel details').first(), trigger=section.locator('summary');
  await expect(section).toHaveAttribute('open',''); await trigger.click(); await expect(section).not.toHaveAttribute('open','');
  await trigger.click(); await page.locator('.menu-panel').getByRole('link',{name:'Search',exact:true}).click();
  await expect(page).toHaveURL('/search');
});
