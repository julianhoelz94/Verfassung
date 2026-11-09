import { expect, it } from "vitest";
import type { Amendment } from "./api";
import { constitutionHistory, historyYearGroups } from "./constitution-history";

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

it("groups filtered chronological events by year and retains undated records", () => {
  const event = { kind: "event" as const, title: "Event", href: "/event" };
  const items = [
    { ...event, id: "latest", date: "2024-12-01" },
    { ...event, id: "same-year", date: "2024-01-01" },
    { ...event, id: "earlier", date: "2020-01-01" },
    { ...event, id: "unknown", date: "" },
  ];
  expect(
    historyYearGroups(items).map((group) => [
      group.year,
      group.events.map((item) => item.id),
    ]),
  ).toEqual([
    ["2024", ["latest", "same-year"]],
    ["2020", ["earlier"]],
    ["", ["unknown"]],
  ]);
  expect(
    historyYearGroups(items.filter((item) => item.id === "earlier")),
  ).toEqual([{ year: "2020", events: [items[2]] }]);
});
