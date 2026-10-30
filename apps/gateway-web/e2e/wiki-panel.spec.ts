import { expect, test } from './fixtures/consent';
import { signInAdmin } from './helpers';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const countryId = '01900000-0000-4000-8000-000000000001';
const constitutionId = '01900000-0000-4000-8000-000000000002';
const regionId = '07100000-0000-4000-8000-000000000001';
const formerId = '07100000-0000-4000-8000-000000000002';

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__sprint50_content`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__country_directory`, { data: {} })).ok()).toBeTruthy();
});

for (const width of [390, 1440]) test(`all wikis share the constitution design and page scrolling at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 900 });
  await signInAdmin(page);
  let constitutionTypography: unknown;
  for (const [path, type, id, title] of [
    ['/countries/DE/versions/01900000-0000-4000-8000-000000000004', 'constitution', constitutionId, 'About this constitution'],
    ['/countries/DE', 'country', countryId, 'About Germany'],
    [`/jurisdictions/${regionId}`, 'jurisdiction', regionId, 'About Example Region'],
    [`/jurisdictions/${formerId}`, 'jurisdiction', formerId, 'About Former Province'],
  ]) {
    const wikiPath = `${mock}/api/catalog/wiki/${type}/${id}`;
    const headers = { Authorization: 'Bearer e2e-session-token' };
    const current = await (await request.get(`${wikiPath}/draft`, { headers })).json();
    const saved = await request.put(`${wikiPath}/draft`, { headers, data: { expectedRevisionId: current?.id ?? null, summary: 'Shared Wiki design', body: Array.from({ length: 14 }, (_, index) => `Section ${index + 1}: Published background remains readable as part of the page, including its full text and sources.`).join('\n\n'), images: [], sourceUrls: [] } });
    expect(saved.ok()).toBeTruthy();
    expect((await request.post(`${wikiPath}/publish`, { headers, data: { revisionId: (await saved.json()).id } })).ok()).toBeTruthy();
    await page.goto(path);
    await page.getByRole('button', { name: 'Wiki', exact: true }).click();
    const wiki = page.getByRole('region', { name: 'Wiki', exact: true });
    await expect(wiki.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(wiki.getByText('Context & history', { exact: true })).toBeVisible();
    const metrics = await wiki.evaluate(element => {
      const typography = getComputedStyle(element.querySelector('p')!);
      const scrollContainers: string[] = [];
      for (let node: Element | null = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) scrollContainers.push(node.tagName);
      }
      return { scrollContainers, height: element.getBoundingClientRect().height, typography: [typography.fontFamily, typography.fontSize, typography.lineHeight] };
    });
    expect(metrics.scrollContainers).toEqual([]);
    expect(metrics.height).toBeGreaterThan(500);
    if (type === 'constitution') constitutionTypography = metrics.typography;
    else expect(metrics.typography).toEqual(constitutionTypography);
    await wiki.getByText(/^Section 14:/).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Wiki', exact: true })).toBeInViewport();
    await wiki.getByRole('link', { name: type === 'constitution' ? 'Edit constitution page' : 'Edit wiki', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(wiki).toBeHidden();
    await expect(page.getByRole('button', { name: 'Wiki', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Wiki', exact: true }).click();
    await wiki.getByRole('button', { name: 'Close Wiki', exact: true }).click();
    await expect(wiki).toBeHidden();
    await expect(page.getByRole('button', { name: 'Wiki', exact: true })).toBeFocused();
  }
});
