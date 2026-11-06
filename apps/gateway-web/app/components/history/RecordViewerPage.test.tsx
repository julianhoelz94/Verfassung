import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "../../../lib/api";
import { currentUser } from "../../../lib/session";
import {
  listDocumentLinks,
  type DocumentLink,
} from "../../../lib/document-api";
import {
  countryFixture,
  instrument,
  nextLaw,
  original,
} from "../../../test/reader-fixtures";
import { AmendmentViewerPage, LifecycleViewerPage } from "./RecordViewerPage";

vi.mock("../../../lib/api", async (originalModule) => ({
  ...(await originalModule<typeof import("../../../lib/api")>()),
  getCountry: vi.fn(),
  getConstitutionEvents: vi.fn(),
  getWikiPage: vi.fn(),
  listConstitutionAmendments: vi.fn(),
}));
vi.mock("../../../lib/session", () => ({ currentUser: vi.fn() }));
vi.mock("../../../lib/server-locale", () => ({
  currentLocale: async () => "en",
}));
vi.mock("../../../lib/document-api", () => ({ listDocumentLinks: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));
// Exercise server composition and capability decisions; independent material forms are tested separately.
vi.mock("./ConstitutionViewer", () => ({
  ConstitutionViewer: ({
    children,
    navigation,
    historyHref,
  }: {
    children: ReactNode;
    navigation: ReactNode;
    historyHref: string;
  }) => (
    <div data-history={historyHref}>
      {navigation}
      {children}
    </div>
  ),
}));
vi.mock("./RecordMaterials", () => ({
  RecordMaterials: (props: {
    targetType: string;
    targetId: string;
    scope?: string;
    editable: boolean;
  }) => (
    <section
      data-target={props.targetType}
      data-id={props.targetId}
      data-scope={props.scope}
      data-editable={props.editable}
    />
  ),
}));

const base = "/countries/XA/constitutions/charter";
const event: api.ConstitutionLifecycleEvent = {
  id: "adoption",
  constitutionId: "charter",
  eventType: "adopted",
  eventDate: "1949-05-23",
  dateCertainty: "approximate",
  note: "Original adoption evidence",
  sourceUrl: "https://archive.example/adoption",
};
const law: api.Amendment = {
  ...instrument,
  changes: [
    {
      ...instrument.changes[0],
      beforeRef: {
        logicalId: "logical-1",
        label: "Article 1",
        breadcrumbs: ["Rights"],
        text: "Some citizens may vote.",
        deepLink: "/countries/XA/versions/correction-1949#unit-old-1",
      },
      afterRef: {
        logicalId: "logical-1",
        label: "Article 1",
        text: "Every adult citizen may vote.",
        deepLink: "/countries/XA/versions/law-1956#unit-new-1",
      },
    },
  ],
};
const amendmentPage = (query: Record<string, string> = {}, id = "instrument") =>
  AmendmentViewerPage({
    params: Promise.resolve({
      code: "XA",
      constitutionId: "charter",
      amendmentId: id,
    }),
    searchParams: Promise.resolve(query),
  });
const eventPage = (query: Record<string, string> = {}, id = "adoption") =>
  LifecycleViewerPage({
    params: Promise.resolve({
      code: "XA",
      constitutionId: "charter",
      eventId: id,
    }),
    searchParams: Promise.resolve(query),
  });
const dom = async (page: Promise<ReactNode>) =>
  new DOMParser().parseFromString(
    renderToStaticMarkup(await page),
    "text/html",
  );
function role(name: string) {
  vi.mocked(currentUser).mockResolvedValue({ roles: [name] } as NonNullable<
    Awaited<ReturnType<typeof currentUser>>
  >);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getCountry).mockResolvedValue(countryFixture());
  vi.mocked(api.getWikiPage).mockResolvedValue(null);
  vi.mocked(api.listConstitutionAmendments).mockResolvedValue([law]);
  vi.mocked(api.getConstitutionEvents).mockResolvedValue([event]);
  vi.mocked(listDocumentLinks).mockResolvedValue([]);
  vi.mocked(currentUser).mockResolvedValue(null);
});

it.each(["viewer", "editor", "reviewer", "publisher", "admin"])(
  "keeps amendment command links and material capabilities correct for %s",
  async (name) => {
    role(name);
    const returnTo =
      base +
      "?passage=logical-1&sourceVersion=law-1949&sourceAnchor=old-1&kind=amendment&year=1956&q=vote";
    const page = await dom(
      amendmentPage({ return: returnTo, materialsSaved: "1" }),
    );
    const editor = name === "editor" || name === "admin";
    const links = [...page.querySelectorAll("a")].map((a) => a.textContent);
    expect(links.includes("Edit amendment")).toBe(editor);
    expect(links.includes("Edit this change")).toBe(editor);
    expect(links.includes("Open workspace")).toBe(
      name === "reviewer" || name === "publisher",
    );
    expect(
      page
        .querySelector('[data-target="change_material"]')
        ?.getAttribute("data-scope"),
    ).toBe("change-1");
    expect(
      page
        .querySelector('[data-target="amendment_material"]')
        ?.getAttribute("data-scope"),
    ).toBeNull();
    expect(
      page
        .querySelector('[data-target="change_material"]')
        ?.getAttribute("data-editable"),
    ).toBe(String(editor));
    expect(page.body.textContent).toContain("Material saved.");
    expect(page.body.textContent).toContain("Back to passage history");
    const history = new URL(
      page.querySelector("[data-history]")!.getAttribute("data-history")!,
      "https://atlas.example",
    );
    expect(history.searchParams.get("passage")).toBe("logical-1");
    expect(history.searchParams.get("year")).toBe("1956");
    expect(history.searchParams.get("q")).toBe("vote");
    expect(JSON.parse(history.searchParams.get("viewed")!)).toMatchObject({
      kind: "amendment",
      id: "instrument",
    });
  },
);

it.each(["viewer", "editor", "reviewer", "publisher", "admin"])(
  "restricts lifecycle editing and materials to publishing capability for %s",
  async (name) => {
    role(name);
    const page = await dom(
      eventPage({
        saved: "1",
        return: "/countries/XA/compare?from=law-1949&to=law-1956",
      }),
    );
    const allowed = name === "publisher" || name === "admin";
    expect(
      [...page.querySelectorAll("a")].some(
        (a) => a.textContent === "Edit lifecycle event",
      ),
    ).toBe(allowed);
    const material = page.querySelector('[data-target="lifecycle_material"]')!;
    expect(material.getAttribute("data-id")).toBe("charter");
    expect(material.getAttribute("data-scope")).toBe("adoption");
    expect(material.getAttribute("data-editable")).toBe(String(allowed));
    expect(page.body.textContent).toContain("Approximate date");
    expect(page.body.textContent).toContain("Event evidence saved.");
    expect(page.body.textContent).toContain("Back to comparison");
    expect(
      page.querySelector('a[href="/countries/XA/versions/correction-1949"]'),
    ).not.toBeNull();
    const history = new URL(
      page.querySelector("[data-history]")!.getAttribute("data-history")!,
      "https://atlas.example",
    );
    expect(JSON.parse(history.searchParams.get("viewed")!)).toMatchObject({
      kind: "event",
      id: "adoption",
    });
  },
);

it("preserves exact public evidence pins and excludes unsafe legacy links", async () => {
  vi.mocked(api.listConstitutionAmendments).mockResolvedValue([
    {
      ...law,
      documents: [
        { url: "javascript:alert(1)", label: "Unsafe" },
        { url: "https://archive.example/official", label: "Official source" },
      ],
    },
  ]);
  vi.mocked(listDocumentLinks).mockResolvedValue([
    {
      documentId: "source",
      document: { revision: { revision: 4, title: "Pinned evidence" } },
    } as DocumentLink,
  ]);
  const page = await dom(
    amendmentPage({
      return: "/countries/XA/compare?from=law-1949&to=law-1956",
    }),
  );
  expect(
    page.querySelector('a[href="/documents/source?revision=4"]')?.textContent,
  ).toBe("Pinned evidence");
  expect(page.body.textContent).toContain("Back to comparison");
  expect(page.body.textContent).not.toContain("Unsafe");
  expect(listDocumentLinks).toHaveBeenCalledWith(
    "amendment",
    "instrument",
    "instrument-r1",
  );
});

it("shows revision conflicts and unavailable evidence without inventing missing passage wording", async () => {
  vi.mocked(api.listConstitutionAmendments).mockResolvedValue([instrument]);
  vi.mocked(listDocumentLinks).mockRejectedValue(new Error("Unavailable"));
  const lawPage = await dom(amendmentPage({ materialsError: "conflict" }));
  expect(lawPage.body.textContent).toContain(
    "The material could not be saved.",
  );
  expect(lawPage.body.textContent).toContain(
    "Source documents are temporarily unavailable.",
  );
  expect(lawPage.body.textContent).toContain("Expanded electorate");
  expect(lawPage.body.textContent).not.toContain("Not present");
  const lifecycle = await dom(eventPage({ error: "conflict" }));
  expect(lifecycle.body.textContent).toContain(
    "The event evidence could not be saved.",
  );
  expect(lifecycle.body.textContent).toContain("Original adoption evidence");
});

it("rejects unknown records and distinguishes service outages from an empty legal history", async () => {
  await expect(amendmentPage({}, "unknown")).rejects.toThrow("not-found");
  await expect(eventPage({}, "unknown")).rejects.toThrow("not-found");
  vi.mocked(api.listConstitutionAmendments).mockRejectedValue(
    new Error("Unavailable"),
  );
  expect(
    (await dom(amendmentPage())).querySelector('[role="status"]'),
  ).not.toBeNull();
  vi.mocked(api.getConstitutionEvents).mockRejectedValue(
    new Error("Unavailable"),
  );
  expect(
    (await dom(eventPage())).querySelector('[role="status"]'),
  ).not.toBeNull();
  vi.mocked(api.getCountry).mockRejectedValue(new Error("Unavailable"));
  expect(
    (await dom(eventPage())).querySelector(
      'a[href="/countries/XA/constitutions/charter"]',
    ),
  ).not.toBeNull();
});
