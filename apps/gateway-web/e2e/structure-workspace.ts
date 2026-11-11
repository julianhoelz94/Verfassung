import type { Page } from "@playwright/test";
import { expect } from "./fixtures/consent";

export async function openStructureTask(page: Page, name: "Details" | "Structure" | "Documents" | "Review" | "History") {
  await page.getByRole("tab", { name, exact: true }).click();
}

/** The viewer-style overview toggle owns the same hierarchy on desktop and mobile. */
export async function selectStructureLevel(page: Page, name: string, section?: "Structure" | "Editing" | "Display") {
  const overview = page.locator("#structure-contents");
  await expect(page.getByRole("tab", { name: "Structure", exact: true })).toBeVisible();
  if (!(await overview.isVisible())) await page.getByRole("button", { name: "Show overview", exact: true }).click();
  await overview.locator("button[aria-current]").filter({ has: page.getByText(name, { exact: true }) }).first().click();
  const fields = page.getByRole("region", { name: / Structure$/ });
  if (section) await fields.getByRole("button", { name: section, exact: true }).click();
  return fields;
}
