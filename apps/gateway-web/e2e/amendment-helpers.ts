import type { Page } from '@playwright/test';

export async function amendmentTask(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Amendment workspace' }).getByRole('button', { name: name==='Review'?/^Review(?: \(\d+\))?$/:name, exact: true }).click();
}
export async function publishLaw(page: Page) {
  await amendmentTask(page, 'Publication');
  await page.getByLabel('I confirm this revision is ready for publication.').check();
  await page.getByRole('button', { name: 'Publish law', exact: true }).click();
}
export async function withdrawLaw(page: Page) {
  await amendmentTask(page, 'Publication');
  await page.getByText('Withdraw published law', { exact: true }).click();
  await page.getByLabel('Confirm withdrawal from public view.').check();
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
}
