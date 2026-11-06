import { test, expect } from '../fixtures/consent';
import { signIn, startFromViewer } from './auth';
import { adminHeaders } from './api-fixtures';
import { amendmentTask } from '../amendment-helpers';
import path from 'node:path';

test('both editors create and reuse central documents in place without losing unsaved text',async({page,request,browser},testInfo)=>{
  test.setTimeout(180_000);page.setDefaultTimeout(15_000);
  const title=`Shared editor evidence ${Date.now()}`,headers=await adminHeaders(request);
  const constitution=await (await request.post('/api/catalog/countries/XA/constitutions',{headers,data:{slug:'documents-'+Date.now(),title,outline:[
    {kindCode:'article',displayLabel:'Article',titlePolicy:'optional',labelPolicy:'required',showKind:true,showLabel:true,showTitle:true,allowTextAlongsideChildren:true},
    {kindCode:'sentence',displayLabel:'Sentence',titlePolicy:'optional',labelPolicy:'optional',showKind:false,showLabel:false,showTitle:false,presentation:'concatenated',segmentation:'sentence',sentenceDelimiters:['.','!','?']},
  ]}})).json();
  const version=await (await request.post(`/api/catalog/constitutions/${constitution.id}/versions`,{headers,data:{versionLabel:'2020',effectiveDate:'2020-01-01',languageCode:'en'}})).json();
  const content=await request.put(`/api/content/versions/${version.id}/content`,{headers,data:{expectedGeneration:0,roots:[{kind:'article',label:'1',title:'Rights',content:[{type:'child',node:{kind:'sentence',content:[{type:'text',text:'Original constitutional wording.'}]}}]}]}});expect(content.ok(),await content.text()).toBe(true);
  const published=await request.post(`/api/catalog/versions/${version.id}/publish`,{headers});expect(published.ok(),await published.text()).toBe(true);
  const fixture={countryIso:'XA',constitutionId:constitution.id,targetVersionId:version.id};
  await signIn(page,'admin');await startFromViewer(page,fixture.countryIso,fixture.targetVersionId,'editorial_correction');
  const editorUrl=page.url(),canvas=page.locator('#draft-form [contenteditable="true"]').first();
  await canvas.fill('Unsaved wording stays in the constitution editor.');
  await page.getByRole('button',{name:'Documents',exact:true}).click();
  await page.getByRole('button',{name:'Upload new document',exact:true}).click();
  await page.getByLabel('File',{exact:true}).setInputFiles({name:'new-law.txt',mimeType:'text/plain',buffer:Buffer.from('Exact supporting law bytes.\n')});
  await page.getByRole('textbox',{name:'Title',exact:true}).fill(title);
  await page.getByRole('button',{name:'Upload and attach',exact:true}).click();
  await expect(page.getByRole('link',{name:title,exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('sessionId')).toBe(new URL(editorUrl).searchParams.get('sessionId'));
  await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(canvas).toContainText('Unsaved wording stays');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved.',{exact:true})).toBeVisible();
  const records=await (await request.get('/api/document/documents?q='+encodeURIComponent(title),{headers})).json();expect(records).toHaveLength(1);
  const document=records[0];
  const file=await request.get(`/api/document/documents/${document.id}/revisions/${document.revision.revision}/file`,{headers});expect(file.ok()).toBe(true);expect(await file.text()).toBe('Exact supporting law bytes.\n');
  await page.getByRole('button',{name:'Documents',exact:true}).click();await expect(page.getByRole('link',{name:title,exact:true})).toBeVisible();
  const amendmentResponse=await request.post(`/api/amendment/constitutions/${fixture.constitutionId}/amendments`,{headers,data:{title:title+' law',comment:'Original public comment.',sourceVersionId:fixture.targetVersionId,changes:[],documents:[]}});
  expect(amendmentResponse.ok(),await amendmentResponse.text()).toBe(true);const amendment=await amendmentResponse.json();
  await page.goto(`/editor/amendments/${amendment.id}`);await page.getByLabel('Public amendment comment').fill('Unsaved amendment rationale.');
  await amendmentTask(page,'Documents');await page.getByRole('button',{name:'Choose existing document',exact:true}).click();
  await page.getByLabel('Search documents').fill(title);await page.getByRole('button',{name:'Search library',exact:true}).click();await page.getByLabel('Document',{exact:true}).selectOption(document.id);await page.getByRole('button',{name:'Attach document',exact:true}).click();
  await expect(page.getByRole('link',{name:title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Upload new document',exact:true}).click();await page.getByRole('textbox',{name:'Title',exact:true}).fill(title+' explanatory memorandum');
  await page.getByLabel('Source URL',{exact:true}).fill('https://example.org/editorial/explanation');await page.getByRole('button',{name:'Create and attach',exact:true}).click();
  await expect(page.getByRole('link',{name:title+' explanatory memorandum',exact:true})).toBeVisible();
  await amendmentTask(page,'Affected passages');await expect(page.getByLabel('Public amendment comment')).toHaveValue('Unsaved amendment rationale.');
  const revisions=await (await request.get(`/api/amendment/amendments/${amendment.id}/revisions`,{headers})).json();
  const links=await (await request.get(`/api/document/links/amendment/${amendment.id}?scopeRevisionId=${revisions.at(-1).id}`,{headers})).json();expect(links).toHaveLength(2);expect(links.find((link:{documentId:string})=>link.documentId===document.id).revisionId).toBe(document.revision.id);
  expect(await (await request.get('/api/document/documents?q='+encodeURIComponent(title),{headers})).json()).toHaveLength(2);
  for(const locale of ['en','de']) {
    const context=await browser.newContext({baseURL:new URL(editorUrl).origin,locale});
    await context.addCookies(await page.context().cookies());await context.addInitScript(()=>localStorage.setItem('ca_cookie_notice_v1','dismissed'));
    const inspection=await context.newPage();
    await inspection.goto(`/editor/amendments/${amendment.id}?view=documents`);
    await expect(inspection.locator('html')).toHaveAttribute('lang',locale);
    await inspection.getByRole('button',{name:locale==='en'?'Upload new document':'Neues Dokument hochladen',exact:true}).click();
    for(const width of [390,1440]) {
      await inspection.setViewportSize({width,height:900});expect(await inspection.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await inspection.evaluate(()=>scrollTo(0,0));await inspection.screenshot({path:testInfo.outputPath(`shared-documents-${locale}-${width}.png`)});
    }
    await inspection.addScriptTag({path:path.join(process.cwd(),'node_modules/axe-core/axe.min.js')});
    const violations=await inspection.evaluate(async()=>{
      // @ts-expect-error Local axe script is injected for browser verification.
      return (await window.axe.run(document.querySelector('main'))).violations.map((item:{id:string})=>item.id);
    });expect(violations).toEqual([]);await context.close();
  }
});
