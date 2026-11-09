import { test, expect } from "./fixtures/consent";
import { signInAdmin, VERSION_2022 } from "./helpers";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const run = "01900000-0000-4000-8000-000000008500";
const version = "01900000-0000-4000-8000-000000000804";
const session = "01900000-0000-4000-8000-000000000501";
const pages = [
  ["import", `/admin/import/packages/${run}`],
  ["viewer", `/countries/DE/versions/${VERSION_2022}`],
  ["editor", `/editor?sessionId=${session}&versionId=${version}`],
  ["country", "/countries/DE"],
  ["region", "/jurisdictions/01900000-0000-4000-8000-000000000001"],
  ["documents", "/documents"],
] as const;

for (const locale of ["en", "de"])
  for (const width of [390, 700, 1440]) {
    test(`import design comparison in ${locale} at ${width}px`, async ({
      page,
      request,
    }, info) => {
      await request.post(`${mock}/__reset`);
      await request.post(`${mock}/__sprint59_content`);
      await request.post(`${mock}/__import_review`, { data: {} });
      await request.post(`${mock}/__document_library`);
      await request.post(`${mock}/api/editor/edit-sessions`, {
        data: { versionId: version, hopKind: "editorial_correction" },
      });
      await page.setViewportSize({ width, height: 1000 });
      await signInAdmin(page);
      await request.put(`${mock}/api/identity/me/language`, {
        headers: { Authorization: "Bearer e2e-session-token" },
        data: { languagePreference: locale },
      });
      const measurements = [];
      for (const [name, path] of pages) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(page.locator("main h1")).toHaveCount(1);
        await expect(page.locator("main h1")).toBeVisible();
        if (name === "import") {
          await expect(
            page.getByRole("button", { name: /package contents|Paketinhalt/ }),
          ).toHaveAttribute("aria-expanded", width > 760 ? "true" : "false");
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          path,
        ).toBe(true);
        measurements.push({
          name,
          path,
          width,
          locale,
          ...(await page.evaluate(() => {
            const heading = document.querySelector("main h1")!;
            const header = document.querySelector("main .page-header");
            const bar = document.querySelector(
              'main [class*="menuBar"], main [aria-label="Documents toolbar"], main [aria-label="Dokumentenwerkzeuge"]',
            );
            const control = bar?.querySelector("button, a");
            const box = (node: Element | null) => {
              if (!node) return null;
              const rect = node.getBoundingClientRect(),
                style = getComputedStyle(node);
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                font: style.font,
                color: style.color,
                background: style.backgroundColor,
                padding: style.padding,
                gap: style.gap,
                border: style.borderBottom,
                radius: style.borderRadius,
              };
            };
            return {
              heading: box(heading),
              header: box(header),
              bar: box(bar),
              control: box(control),
              main: box(document.querySelector("main")),
            };
          })),
        });
        await page.screenshot({
          path: info.outputPath(`audit-${name}-${locale}-${width}.png`),
          fullPage: true,
        });
        if (name === "import") {
          await page.addScriptTag({
            content: readFileSync(
              require.resolve("axe-core/axe.min.js"),
              "utf8",
            ),
          });
          const violations = await page.evaluate(async () => {
            // @ts-expect-error axe is injected for this audit.
            return (await window.axe.run(document)).violations.map(
              ({ id }: { id: string }) => id,
            );
          });
          expect(violations).toEqual([]);
          await page.evaluate(() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: "instant",
            }),
          );
          await page.screenshot({
            path: info.outputPath(`audit-import-bottom-${locale}-${width}.png`),
          });
        }
      }
      await writeFile(
        info.outputPath(`design-metrics-${locale}-${width}.json`),
        JSON.stringify(measurements, null, 2),
      );
    });
  }
