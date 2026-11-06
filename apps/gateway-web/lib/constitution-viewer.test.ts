import { expect, it } from "vitest";
import type { ConstitutionSummary } from "./api";
import {
  historyHref,
  parseViewerLocation,
  safeViewerReturn,
} from "./constitution-viewer";
import { original, nextLaw } from "../test/reader-fixtures";
const constitution: ConstitutionSummary = {
  id: "charter",
  title: "Charter",
  slug: "charter",
  versions: [original, nextLaw],
};
it("retains a complete comparison context and rejects other owners or malformed destinations", () => {
  const location = {
    kind: "comparison",
    href: `/countries/XA/compare?from=${original.currentVersionId ?? original.id}&to=${nextLaw.currentVersionId ?? nextLaw.id}&reversed=1&q=assembly`,
    label: "ignored",
  };
  expect(
    parseViewerLocation(
      JSON.stringify(location),
      "/countries/XA",
      constitution,
      [],
      [],
    )?.href,
  ).toContain("reversed=1&q=assembly");
  expect(
    parseViewerLocation(
      JSON.stringify({ ...location, href: "https://example.org/compare" }),
      "/countries/XA",
      constitution,
      [],
      [],
    ),
  ).toBeNull();
  expect(
    parseViewerLocation("{bad", "/countries/XA", constitution, [], []),
  ).toBeNull();
});
it("serializes the actual viewed record without marking an unrelated version as current", () => {
  const href = historyHref("/countries/XA", "charter", {
    kind: "event",
    id: "adopted",
    label: "Adoption",
    href: "/countries/XA/constitutions/charter/events/adopted",
  });
  const parsed = parseViewerLocation(
    new URL(href, "https://atlas.invalid").searchParams.get("viewed") ??
      undefined,
    "/countries/XA",
    constitution,
    [],
    ["adopted"],
  );
  expect(parsed?.kind).toBe("event");
  expect(parsed?.id).toBe("adopted");
  expect(safeViewerReturn("//example.org", "/countries/XA")).toBeUndefined();
});
