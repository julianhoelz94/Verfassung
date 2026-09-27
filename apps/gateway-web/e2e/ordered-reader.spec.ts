import { expect, test } from '@playwright/test';
import type { OrderedEntry } from '../lib/api';
import { VERSION_2022 } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('generic unit page renders ordered hierarchy and every text occurrence anchor', async ({ page, request }) => {
  const response = await request.get(`${mockOrigin}/api/content/versions/${VERSION_2022}/units?includeBody=true`);
  expect(response.ok()).toBeTruthy();
  const unit = (await response.json())[0];
  function textEntries(entries: OrderedEntry[]): OrderedEntry[] {
    return entries.flatMap((entry) => entry.node ? textEntries(entry.node.content) : [entry]);
  }
  const texts = textEntries(unit.content);
  expect(texts.length).toBeGreaterThan(0);
  await page.goto(`/countries/DE/versions/${VERSION_2022}/units/${unit.id}`);
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await expect(page.locator(`[id="${unit.id}"]`)).toBeVisible();
  for (const entry of texts) await expect(page.locator(`[id="${entry.occurrenceId}"]`)).toHaveText(entry.text);
});

test('global unit permalink redirects to the exact version and text occurrence', async ({ page, request }) => {
  const units = await (await request.get(`${mockOrigin}/api/content/versions/${VERSION_2022}/units?includeBody=true`)).json();
  const unit = units[0];
  let entry = unit.content[0];
  while (entry.node) entry = entry.node.content[0];
  expect(entry.occurrenceId).toBeTruthy();
  await page.goto(`/versions/${VERSION_2022}/units/${unit.id}?occurrenceId=${entry.occurrenceId}`);
  await expect(page).toHaveURL(`/countries/DE/versions/${VERSION_2022}/units/${unit.id}#${entry.occurrenceId}`);
  await expect(page.locator(`[id="${entry.occurrenceId}"]`)).toBeVisible();
  await expect(page.locator(`[id="${entry.occurrenceId}"]`)).toHaveText(entry.text);
});
