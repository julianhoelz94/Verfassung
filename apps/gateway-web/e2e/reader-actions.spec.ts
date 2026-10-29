import {test,expect} from './fixtures/consent';
import {VERSION_2022} from './helpers';
import {continuousReaderUnits} from './fixtures/continuous-reader.mjs';
const mock=`http://127.0.0.1:${process.env.E2E_MOCK_PORT??4010}`,href=`/countries/DE/versions/${VERSION_2022}`,units=continuousReaderUnits(VERSION_2022);
const paragraph=units[0].content[0].node,sentence=paragraph.content[0].node;
const selector=(id:string)=>`[id="${id}"]`;
test.beforeEach(async({request,context})=>{
 await request.post(mock+'/__reset');await request.post(mock+'/__continuous_reader');
 await context.addInitScript(()=>{let value='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{if(location.search.includes('clipboard=blocked'))throw new Error('denied');value=text;},readText:async()=>value}});});
});
test('right-click copies exact published sentence, paragraph, article and constitution scopes',async({page},info)=>{
 await page.goto(href);await page.locator(selector(sentence.occurrenceId)).click({button:'right'});
 let menu=page.getByRole('menu',{name:'Copy text or permalink'});await expect(menu.getByRole('menuitem')).toHaveCount(8);
 await menu.getByRole('menuitem',{name:/^Sentence/}).first().click();await expect(page.getByRole('status',{name:''}).filter({hasText:'Permalink copied'})).toBeVisible();
 const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toBe(new URL(href+'#'+sentence.occurrenceId,page.url()).href);
 await page.goto(copied);await expect(page.locator(selector(sentence.occurrenceId))).toBeInViewport();
 await page.locator(selector(paragraph.occurrenceId)+' > .num').click({button:'right'});menu=page.getByRole('menu');await expect(menu.getByRole('menuitem')).toHaveCount(6);await expect(menu.getByRole('menuitem',{name:/^Sentence/})).toHaveCount(0);
 await menu.getByRole('menuitem',{name:/^Paragraph/}).last().click();await expect(page.getByRole('status').filter({hasText:'Original text copied'})).toBeVisible();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('(1)\nEvery person has equal rights. These rights bind public authority.');
 await page.locator(selector('unit-'+units[0].id)).click({button:'right'});await expect(page.getByRole('menuitem')).toHaveCount(4);await page.getByRole('menuitem',{name:/^Article/}).last().click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('Article 1 — Equal standing');
 await page.getByRole('button',{name:'Copy text or permalink'}).click();await page.getByRole('menuitem',{name:/^Constitution/}).last().click();
 const text=await page.evaluate(()=>navigator.clipboard.readText());expect(text).toContain('The legislature meets in public.\nThe executive remains accountable.');expect(text).toContain('Public body\tAccountability');expect(text).toContain('* A constitution-wide source note.');expect(text).not.toContain('Open passage');
 await expect(page.locator('a[aria-label^="Passage link"]')).toHaveCount(0);
 await page.locator(selector(sentence.occurrenceId)).click({button:'right'});await page.screenshot({path:info.outputPath('reader-context-menu.png')});
});
test('keyboard menu stays within a short viewport and restores focus',async({page})=>{
 await page.setViewportSize({width:1280,height:320});await page.goto(href);const target=page.locator(selector(sentence.occurrenceId));await expect(target).toBeVisible();await expect(target).toHaveAttribute('tabindex','-1');await target.focus();await expect(target).toBeFocused();await page.keyboard.press('Shift+F10');
 const menu=page.getByRole('menu');await expect(menu).toBeVisible();const box=(await menu.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(11);expect(box.y+box.height).toBeLessThanOrEqual(309);
 await page.keyboard.press('End');await expect(menu.getByRole('menuitem').last()).toBeFocused();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(target).toBeFocused();
});
test('touch readers can use the toolbar and clipboard failures expose a selected manual copy field',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(href+'?clipboard=blocked');await page.getByRole('button',{name:'Copy text or permalink'}).click();await page.getByRole('menuitem',{name:/^Article/}).last().click();
 const dialog=page.getByRole('dialog',{name:'Copy original text'});await expect(dialog.getByRole('textbox')).toContainText('Every person has equal rights.');await expect(dialog.getByRole('textbox')).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Copy text or permalink'})).toBeFocused();
});
test('one shared footnote return control opens distinct destinations and preserves source labels',async({page},info)=>{
 await page.goto(href);await page.locator('#reader-footnotes').scrollIntoViewIfNeeded();const note=page.getByRole('note');
 await expect(note).toContainText('*');const back=note.getByRole('button',{name:'Back to references (2) ↑',exact:true});await expect(back).toHaveCount(1);await back.click();
 const menu=page.getByRole('menu',{name:'Choose a footnote reference'});await expect(menu.getByRole('menuitem')).toHaveCount(2);await expect(menu.getByRole('menuitem').first()).toContainText('Article 1');await expect(menu.getByRole('menuitem').last()).toContainText('Article 20');
 await page.screenshot({path:info.outputPath('footnote-reference-menu.png')});await menu.getByRole('menuitem').first().click();await expect(page.getByRole('button',{name:'Show footnote *'}).first()).toBeInViewport();
});
