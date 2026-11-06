import type { Page } from "@playwright/test";
import { expect } from "./fixtures/consent";

export async function openStructureTask(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Structure", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}

/** The same level picker serves desktop navigation and the mobile disclosure. */
export async function selectStructureLevel(
  page: Page,
  name: string,
  section?: "Structure" | "Editing" | "Display",
) {
  const levels = page.getByRole("complementary", {
    name: "Levels",
    exact: true,
  });
  const toggle = page.getByRole("button", { name: /^Levels ·/ });
  // A streamed server page can still be loading after navigation returns.
  // Wait for either responsive picker before deciding which one to use.
  await expect(levels.or(toggle).filter({ visible: true }).first()).toBeVisible();
  if (!(await levels.isVisible())) {
    await toggle.click();
  }
  await levels
    .locator("button[aria-current]")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first()
    .click();
  const fields = page.getByRole("region", { name: / Structure$/ });
  if (section) {
    await fields.getByRole("button", { name: section, exact: true }).click();
  }
  return fields;
}
