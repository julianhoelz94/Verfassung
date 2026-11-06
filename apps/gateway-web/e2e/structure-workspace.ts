import type { Page } from "@playwright/test";

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
  if (!(await levels.isVisible())) {
    await page.getByRole("button", { name: /^Levels ·/ }).click();
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
