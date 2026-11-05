import { expect, it } from "vitest";
import type { ContentOutline, OrderedNode } from "./api";
import { outlineExample } from "./outline-preview";

type Kind = ContentOutline["kinds"][number];

/** Minimal explicit settings keep example identity and traversal checks independent of templates. */
function kind(code: string, patch: Partial<Kind> = {}): Kind {
  return {
    kindCode: code,
    displayLabel: code,
    sortOrder: 1,
    mayHoldText: true,
    mayHoldChildren: false,
    allowedChildKinds: [],
    presentation: "section",
    showKind: true,
    showTitle: true,
    showLabel: true,
    titlePolicy: "optional",
    labelPolicy: "optional",
    root: false,
    ...patch,
  };
}

/** Traverses produced nodes in stored order for structural assertions only. */
function nodes(roots: OrderedNode[]): OrderedNode[] {
  return roots.flatMap((root) => [
    root,
    ...nodes(root.content.flatMap((entry) => (entry.node ? [entry.node] : []))),
  ]);
}

it("does not infer roots when no kind explicitly permits top-level occurrence", () => {
  expect(
    outlineExample({ kinds: [kind("article"), kind("sentence")] }),
  ).toEqual([]);
});

it("uses path-local cycle guards without suppressing sibling reuse of the same kind", () => {
  const settings = {
    kinds: [
      kind("article", { root: true, allowedChildKinds: ["section"] }),
      kind("section", { allowedChildKinds: ["article", "missing"] }),
    ],
  };
  const roots = outlineExample(settings);
  expect(nodes(roots).map((node) => node.kind)).toEqual([
    "article",
    "section",
    "section",
  ]);
  expect(nodes(roots).map((node) => node.logicalId)).toEqual([
    "sample-0",
    "sample-0-a",
    "sample-0-b",
  ]);
  expect(
    roots[0].content.every((entry) => entry.node?.content.length === 0),
  ).toBe(true);
});

it("retains deterministic sibling IDs, literal labels and mixed text positions for running pairs", () => {
  const settings = {
    kinds: [
      kind("article", {
        root: true,
        allowTextAlongsideChildren: true,
        allowedChildKinds: ["sentence"],
      }),
      kind("sentence", { presentation: "concatenated" }),
    ],
  };
  const roots = outlineExample(settings);
  const root = roots[0];
  expect(root.content.map((entry) => entry.type)).toEqual([
    "text",
    "child",
    "child",
    "text",
    "child",
    "child",
    "text",
  ]);
  const children = nodes(roots).slice(1);
  expect(children.map((child) => child.logicalId)).toEqual([
    "sample-0-a",
    "sample-0-a-next",
    "sample-0-b",
    "sample-0-b-next",
  ]);
  expect(children.map((child) => child.label)).toEqual([
    "(1)",
    "(2a)",
    "(3)",
    "(4)",
  ]);
  expect(root.label).toBe("46a");
});

it("never multiplies a concatenated container while demonstrating its running leaf children", () => {
  const settings = {
    kinds: [
      kind("article", {
        root: true,
        allowTextAlongsideChildren: true,
        allowedChildKinds: ["section"],
      }),
      kind("section", {
        presentation: "concatenated",
        allowedChildKinds: ["sentence"],
      }),
      kind("sentence", { presentation: "concatenated" }),
    ],
  };
  const roots = outlineExample(settings);
  expect(nodes(roots).filter((node) => node.kind === "section")).toHaveLength(
    2,
  );
  expect(nodes(roots).filter((node) => node.kind === "sentence")).toHaveLength(
    4,
  );
});

it("computes descendant content before translated parent titles in the original callback order", () => {
  const settings = {
    kinds: [
      kind("article", {
        root: true,
        allowTextAlongsideChildren: true,
        titlePolicy: "required",
        allowedChildKinds: ["sentence"],
      }),
      kind("sentence", { presentation: "concatenated" }),
    ],
  };
  let calls = 0;
  const roots = outlineExample(settings, (value) => `${++calls}:${value.en}`);
  const all = nodes(roots);
  expect(roots[0].content[0].text).toMatch(/^1:/);
  expect(all[1].content[0].text).toMatch(/^2:/);
  expect(all[1].title).toMatch(/3:example$/);
  expect(roots[0].title).toMatch(/9:example$/);
  expect(calls).toBe(9);
});

it("retains outline order and absent label/title policies without mutating settings", () => {
  const settings = {
    kinds: [
      kind("first", { root: true, titlePolicy: "none", labelPolicy: "none" }),
      kind("second", { root: true }),
    ],
  };
  const original = JSON.stringify(settings);
  const roots = outlineExample(settings);
  expect(roots.map((node) => node.kind)).toEqual(["first", "second"]);
  expect(roots[0]).toMatchObject({ label: null, title: null });
  expect(roots[1].title).toBeNull();
  expect(JSON.stringify(settings)).toBe(original);
});
