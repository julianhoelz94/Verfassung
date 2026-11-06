import { act } from "react";
import { fireEvent, getByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";
import { mount, click, change, button } from "../../../test/dom";
import { OutlineEditor } from "./OutlineEditor";
import { DEFAULT_NEW_OUTLINE } from "../../../lib/outline";
import {
  outlineGraphProblem,
  explicitLayers,
  outlineBranches,
  placeOutlineLayer,
} from "./outline-editor-model";
vi.mock("./actions", () => ({
  saveOutlineAction: vi.fn(),
  previewOutlineImpactAction: vi.fn(),
}));
vi.mock("./OutlineReaderPreview", () => ({ OutlineReaderPreview: () => null }));
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  if (view) await view.close();
});
const data = () =>
  JSON.parse(
    view.host.querySelector<HTMLInputElement>('[name="outline"]')!.value,
  );
const choose = async (name: string) =>
  click(
    [
      ...view.host.querySelectorAll<HTMLButtonElement>("button[aria-current]"),
    ].find((item) => item.querySelector("span")?.textContent === name)!,
  );

it("rejects disconnected and cyclic outlines rather than writing a partially valid graph", async () => {
  const write = vi.fn(),
    initial = explicitLayers(DEFAULT_NEW_OUTLINE, false);
  initial[0].allowedChildKinds = [];
  view = await mount(<OutlineEditor initial={initial} action={write} />);
  await act(async () => fireEvent.submit(view.host.querySelector("form")!));
  expect(write).not.toHaveBeenCalled();
  expect(getByRole(view.host, "alert").textContent).toContain(
    "Connect every kind",
  );
  const cycle = explicitLayers(DEFAULT_NEW_OUTLINE, false);
  cycle[2].allowedChildKinds = ["article"];
  expect(outlineGraphProblem(cycle)?.en).toContain("cycle");
});
it("changes one named parent edge when inserting a level and preserves other allowed paths", () => {
  const initial = explicitLayers(DEFAULT_NEW_OUTLINE, false);
  initial[0].allowedChildKinds = ["paragraph", "sentence"];
  const next = placeOutlineLayer(initial, "Clause", "between", 2, 1);
  expect(next[0].allowedChildKinds).toEqual(["paragraph", "sentence"]);
  expect(next[1].allowedChildKinds).toEqual(["layer-4"]);
  expect(next[3].allowedChildKinds).toEqual(["sentence"]);
  expect(outlineGraphProblem(next)).toBeNull();
  expect(outlineBranches(next)[0].children).toHaveLength(2);
});
it("reconnects an existing detached kind without creating or renaming it", async () => {
  const initial = explicitLayers(DEFAULT_NEW_OUTLINE, false);
  initial[1].allowedChildKinds = [];
  view = await mount(<OutlineEditor initial={initial} />);
  await click(
    view.host.querySelector('[aria-label="Level actions Sentence"]')!,
  );
  await click(
    getByRole(document.body, "menuitem", { name: "Connect to a parent level" }),
  );
  await change(
    getByRole(view.host, "combobox", {
      name: "Parent level",
    }) as HTMLSelectElement,
    "1",
  );
  await click(button(view.host, "Connect level"));
  expect(data()).toHaveLength(3);
  expect(data()[1].allowedChildKinds).toEqual(["sentence"]);
  expect(outlineGraphProblem(data())).toBeNull();
});
it("keeps technical identity expanded and its field stable when help or its value changes", async () => {
  view = await mount(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} />);
  await click(button(view.host, "Structure"));
  const details = [...view.host.querySelectorAll("details")].find(
    (node) =>
      node.querySelector("summary")?.textContent === "Technical identity",
  )!;
  await click(details.querySelector("summary")!);
  expect(details.open).toBe(true);
  const info = details.querySelector("button")!;
  await click(info);
  expect(details.open).toBe(true);
  expect(details.querySelector('[role="note"]')).not.toBeNull();
  const code = details.querySelector<HTMLInputElement>('[name="code-0"]')!;
  await change(code, "chapter");
  expect(details.open).toBe(true);
  expect(details.querySelector('[name="code-0"]')).toBe(code);
});
it("restores history into an unsaved draft and still requires another impact check", async () => {
  view = await mount(
    <OutlineEditor
      constitutionId="constitution"
      settingsRevisionId="r2"
      initial={DEFAULT_NEW_OUTLINE}
      previous={{
        id: "r1",
        kinds: [
          {
            ...DEFAULT_NEW_OUTLINE[0],
            displayLabel: "Previous name",
            root: true,
            allowedChildKinds: [],
          },
        ],
      }}
    />,
  );
  await click(button(view.host, "History"));
  await click(button(view.host, "Restore as draft"));
  expect(data()[0].displayLabel).toBe("Previous name");
  expect(
    (button(view.host, "Save outline") as HTMLButtonElement).disabled,
  ).toBe(true);
});

it("does not flag a connected kind merely because an orphan also references it", () => {
  const layers = explicitLayers([
    { ...DEFAULT_NEW_OUTLINE[0], root: true, allowedChildKinds: ["sentence"] },
    { ...DEFAULT_NEW_OUTLINE[1], root: false, allowedChildKinds: ["sentence"] },
    { ...DEFAULT_NEW_OUTLINE[2], root: false, allowedChildKinds: [] },
  ], false);
  const branches = outlineBranches(layers);
  expect(branches[1].unplaced).toBe(true);
  expect(branches[1].children[0].unplaced).toBe(false);
  expect(outlineGraphProblem(layers)?.en).toContain("Connect every kind");
});
