import path from 'node:path';
import { expect, test } from './fixtures/consent';
import { signInAdmin } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const proposalId = '01900000-0000-4000-8000-000000000802';
const proposalPath = `/api/ingestion/import-setup-proposals/${proposalId}`;

for (const { language, width } of [{ language: 'en', width: 1440 }, { language: 'de', width: 390 }]) {
  test(`MCP proposal feedback, revision comparison and exact confirmation ${language} ${width}`, async ({ page, request }, testInfo) => {
    await request.post(`${mockOrigin}/__reset`);
    await request.post(`${mockOrigin}/__sprint59_content`);
    await page.setViewportSize({ width, height: 950 });
    const kinds = [
      { kindCode: 'article', displayLabel: 'Artikel', root: true, allowedChildKinds: ['paragraph'], showKind: true, showLabel: true, showTitle: true },
      { kindCode: 'paragraph', displayLabel: 'Absatz', root: false, allowedChildKinds: [], showKind: true, showLabel: true, showTitle: false },
    ];
    const payload = { isoCode: 'DE', countryName: 'Deutschland', constitutionTitle: 'Grundgesetz', constitutionSlug: 'grundgesetz', languageCode: 'de', sourceUrl: 'https://example.org/gg', outline: { kinds }, sampleRoots: [{ kind: 'article', label: '1', content: [{ type: 'child', node: { kind: 'paragraph', label: '1', content: [{ type: 'text', text: 'Die Würde des Menschen ist unantastbar. Sie zu achten ist Verpflichtung.' }] } }] }] };
    await request.post(`${mockOrigin}/api/ingestion/import-setup-proposals`, { data: payload });
    await signInAdmin(page);
    await request.put(`${mockOrigin}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: language } });
    await page.setExtraHTTPHeaders({ 'Accept-Language': language });
    await page.goto(`/admin/import/setup/${proposalId}?lang=${language}`);
    const de = language === 'de';
    const confirmName = de ? 'Struktur bestätigen und vollständigen Upload ermöglichen' : 'Confirm structure and enable full upload';
    await expect(page.getByRole('heading', { name: de ? 'Ihre Bestätigung ist erforderlich' : 'Your confirmation is required' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add deeper layer|Tiefere Ebene/ })).toHaveCount(0);
    await page.getByText(de ? 'Darstellung anpassen' : 'Display settings', { exact: true }).click();
    await page.getByLabel(de ? 'Angezeigte Einheitsbezeichnung' : 'Displayed unit name', { exact: true }).first().fill('Art.');
    await expect(page.locator('[data-preview-kind="article"]').first()).toContainText('Art. 1');
    await page.getByRole('button', { name: de ? 'Darstellung speichern' : 'Save display settings' }).click();
    await expect.poll(async () => (await (await request.get(`${mockOrigin}${proposalPath}`)).json()).revision).toBe(2);
    await page.reload();
    await expect(page.locator('[data-preview-kind="article"]').first()).toContainText('Art. 1');
    await page.getByText(de ? 'Änderungen über den Chat-Client anfordern' : 'Request changes through your chat client', { exact: true }).click();
    await page.getByLabel(de ? 'Gewünschte Änderungen' : 'Requested changes', { exact: true }).fill('Bitte eine Satzebene einfügen und den Wortlaut bewahren.');
    await page.getByRole('button', { name: de ? 'Änderungswünsche speichern' : 'Record requested changes' }).click();
    await expect(page.getByRole('heading', { name: de ? 'Wartet auf einen überarbeiteten Vorschlag' : 'Waiting for a revised proposal' })).toBeVisible();
    await expect(page.getByRole('button', { name: confirmName })).toBeDisabled();
    const feedback = await (await request.get(`${mockOrigin}${proposalPath}`)).json();
    expect(feedback.requestedChanges).toContain('Satzebene');
    const revised = structuredClone(payload);
    revised.outline.kinds[1].allowedChildKinds = ['sentence'];
    revised.outline.kinds.push({ kindCode: 'sentence', displayLabel: 'Satz', root: false, allowedChildKinds: [], showKind: false, showLabel: false, showTitle: false });
    const paragraph = revised.sampleRoots[0].content[0].node;
    paragraph.content = ['Die Würde des Menschen ist unantastbar.', 'Sie zu achten ist Verpflichtung.'].map(text => ({ type: 'child', node: { kind: 'sentence', label: '', content: [{ type: 'text', text }] } })) as typeof paragraph.content;
    expect((await request.put(`${mockOrigin}${proposalPath}`, { headers: { 'If-Match': String(feedback.revision) }, data: revised })).ok()).toBeTruthy();
    await page.getByRole('link', { name: de ? 'Aktuellen Vorschlag laden' : 'Load latest proposal' }).click();
    await expect(page.getByRole('heading', { name: de ? 'Überarbeiteter Vorschlag liegt zur Prüfung vor' : 'Revised proposal ready for review' })).toBeVisible();
    await expect(page.getByText(de ? 'Gliederung oder Bearbeitungsregeln wurden geändert.' : 'Hierarchy or editing rules changed.')).toBeVisible();
    await expect(page.locator('[data-preview-kind="sentence"]')).toHaveCount(2);
    await expect(page.locator('[data-preview-kind="article"]').first()).toContainText('Art. 1');
    await expect(page.getByRole('button', { name: confirmName })).toBeEnabled();
    await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
    expect(await page.evaluate(async () => {
      // @ts-expect-error axe is injected for the audit
      return (await window.axe.run(document)).violations;
    })).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`setup-review-${language}-${width}.png`), fullPage: true });
    await testInfo.attach('setup-review', { path: testInfo.outputPath(`setup-review-${language}-${width}.png`), contentType: 'image/png' });
    const latest = await (await request.get(`${mockOrigin}${proposalPath}`)).json();
    await request.put(`${mockOrigin}${proposalPath}`, { headers: { 'If-Match': String(latest.revision) }, data: { ...revised, constitutionTitle: 'Neuester Vorschlag' } });
    await page.getByRole('button', { name: confirmName }).click();
    await expect(page.getByText(de ? 'Der Vorschlag wurde geändert. Laden und prüfen Sie die aktuelle Überarbeitung, bevor Sie speichern oder bestätigen.' : 'The proposal changed. Load the latest revision and review it before saving or confirming.')).toBeVisible();
    expect((await (await request.get(`${mockOrigin}${proposalPath}`)).json()).status).toBe('proposed');
    await page.getByRole('button', { name: confirmName }).click();
    await expect(page.getByRole('heading', { name: de ? 'Struktur bestätigt – vollständiger Upload möglich' : 'Structure confirmed – full upload enabled' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: confirmName })).toHaveCount(0);
  });
}
