import { expect, test } from '../fixtures/consent';
import { signIn } from './auth';
import { adminHeaders, createIsolatedConstitution } from './api-fixtures';

test('country links open context editors before a wiki page exists and save a private constitution draft', async ({ page, request }) => {
  const title = `Wiki editor journey ${Date.now()}`;
  const fixture = await createIsolatedConstitution(request, title);
  await signIn(page, 'admin');
  await page.goto(`/countries/${fixture.countryIso}`);
  await page.getByRole('link', { name: 'Edit country page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit country page' })).toBeVisible();
  await expect(page.getByLabel('Short description')).toBeVisible();

  await page.goto(`/countries/${fixture.countryIso}`);
  const charter = page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await charter.locator('summary').filter({ hasText: 'Structure and editorial details' }).click();
  await charter.getByRole('link', { name: 'Edit constitution page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit constitution page' })).toBeVisible();
  await expect(page.getByLabel('Short description')).toHaveValue('');
  await page.getByLabel('Short description').fill(title);
  await page.getByLabel('Page text').fill('Private context draft for the new constitution.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(/[?&](saved|error)=1/, { timeout: 15_000 });
  expect(new URL(page.url()).searchParams.get('error'), 'Wiki save must succeed').toBeNull();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  const headers = await adminHeaders(request);
  const draft = await request.get(`/api/catalog/wiki/constitution/${fixture.constitutionId}/draft`, { headers });
  expect(draft.ok()).toBeTruthy();
  expect((await draft.json()).summary).toBe(title);
  const published = await request.get(`/api/catalog/wiki/constitution/${fixture.constitutionId}`);
  expect([200, 204, 404]).toContain(published.status());
  expect(await published.text()).toBe('');
});
