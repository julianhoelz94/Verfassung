import { expect, it } from "vitest";
import type { Amendment } from "./api";
import { constitutionHistory } from "./constitution-history";

it("keeps an amendment without mapped changes in History and excludes it from an exact passage filter", () => {
  const amendment: Amendment = {
    id: "law",
    title: "Recorded amendment",
    summary: "Source material only",
    enactedOn: "2024-01-01",
    sourceReference: "Gazette",
    changes: [],
  };
  const history = (scope: Set<string>) =>
    constitutionHistory(
      "/countries/DE",
      "constitution",
      [],
      [amendment],
      [],
      scope,
    );
  expect(history(new Set())).toMatchObject([
    {
      id: "law",
      kind: "amendment",
      href: "/countries/DE/constitutions/constitution/amendments/law",
    },
  ]);
  expect(history(new Set(["particular-passage"]))).toEqual([]);
});
