import { json, mockState, searchFacets, searchPage } from "./state.mjs";

/** Append dense search facets without mutating the base contract. */
export function handleSearchFacets(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/search/search/facets"))
    return false;
  json(
    res,
    200,
    mockState.denseUi
      ? {
          ...searchFacets,
          countries: [
            ...searchFacets.countries,
            { code: "FR", countryName: "France", count: 60 },
          ],
          versions: [
            ...searchFacets.versions,
            ...Array.from({ length: 60 }, (_, index) => ({
              id: `01900000-0000-4000-8000-${String(1000 + index).padStart(12, "0")}`,
              label: String(1900 + index),
              constitutionTitle: "A constitution with a long descriptive title",
              countryCode: "FR",
              count: 10,
            })),
          ],
        }
      : searchFacets,
  );
  return true;
}

/** Preserve query matching and numeric pagination defaults. */
export function handleSearch(context) {
  const { pathname, method, res, searchParams } = context;
  if (!(method === "GET" && pathname === "/api/search/search")) return false;
  const query = (searchParams.get("q") ?? "").toLowerCase();
  const limit = Math.max(
    1,
    Number(searchParams.get("limit") ?? searchPage.limit) || searchPage.limit,
  );
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
  const hits =
    query.includes("dignity") || query.includes("human") ? searchPage.hits : [];
  json(res, 200, {
    hits: hits.slice(offset, offset + limit),
    total: hits.length,
    limit,
    offset,
  });
  return true;
}
