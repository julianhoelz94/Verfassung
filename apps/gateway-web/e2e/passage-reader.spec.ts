import { expect, test } from './fixtures/consent';
import { VERSION_2022 } from './helpers';
import { continuousReaderUnits } from './fixtures/continuous-reader.mjs';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const reader = `/countries/DE/versions/${VERSION_2022}`;
const article = continuousReaderUnits(VERSION_2022)[9];
const paragraph = article.content[0].node;
const sentence = paragraph.content[0].node;
const target = (id: string) => `[id="${id}"]`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(mock + '/__reset')).ok()).toBeTruthy();
  expect((await request.post(mock + '/__continuous_reader')).ok()).toBeTruthy();
});

for (const width of [390, 820, 1440]) test(`article, paragraph and sentence links share the reader at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  for (const path of [`${reader}/articles/${article.id}`, `${reader}/units/${article.id}#article-${article.articleNumber}`]) {
    await page.goto(path);
    const heading = page.locator(target('unit-' + article.id));
    await expect(heading).toBeInViewport();
    await expect(page.getByRole('toolbar', { name: 'Reading options' })).toBeVisible();
    const bar = (await page.getByRole('toolbar').boundingBox())!;
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    await expect(page.getByRole('navigation', { name: 'Contents', exact: true }).locator('[aria-current="true"]')).toHaveAttribute('href', '#unit-' + article.id);
    await expect(page.getByRole('complementary', { name: 'Source and trust' })).toHaveCount(0);
    await expect(page.getByRole('search', { name: 'Header search' })).toHaveCount(0);
  }
  for (const id of [paragraph.occurrenceId, sentence.occurrenceId]) {
    await page.goto(`${reader}/articles/${article.id}#${id}`);
    await expect(page.locator(target(id))).toBeInViewport();
    await expect(page).toHaveURL(new RegExp('#' + id + '$'));
    await page.locator(target(id)).locator(id === paragraph.occurrenceId ? ':scope > .num' : 'strong').click({ button: 'right' });
    const options = page.getByRole('menu').getByRole('menuitem');
    await expect(options).toHaveCount(id === paragraph.occurrenceId ? 6 : 8);
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: info.outputPath(`passage-reader-${width}.png`) });
});

test('owner-neutral sentence permalinks retain their exact target and snapshot', async ({ page }) => {
  await page.goto(`/versions/${VERSION_2022}/units/${article.id}?occurrenceId=${sentence.occurrenceId}`);
  await expect(page).toHaveURL(new RegExp(`/countries/DE/versions/${VERSION_2022}/units/${article.id}#${sentence.occurrenceId}$`));
  await expect(page.locator(target(sentence.occurrenceId))).toBeInViewport();
  await expect(page.getByRole('toolbar')).toBeVisible();
});
