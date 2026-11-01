import { act } from "react";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";
import type { OutlineKindWrite } from "../../../lib/api";
import { mount, click, button, change } from "../../../test/dom";
import { OutlineEditor } from "./OutlineEditor";

vi.mock("./actions", () => ({
  saveOutlineAction: vi.fn(),
  previewOutlineImpactAction: vi.fn(),
}));
vi.mock("./OutlineReaderPreview", () => ({ OutlineReaderPreview: () => null }));
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  if (view) await view.close();
});

/** A single authored leaf keeps fixtures independent of the default template. */
function leaf(patch: Partial<OutlineKindWrite> = {}): OutlineKindWrite {
  return {
    kindCode: "clause",
    displayLabel: "Clause",
    presentation: "section",
    showKind: true,
    showLabel: true,
    showTitle: true,
    root: true,
    allowedChildKinds: [],
    titlePolicy: "optional",
    labelPolicy: "optional",
    ...patch,
  };
}

/** Public hidden form data is the persisted contract; UI buffers must never leak into it. */
function payload(): OutlineKindWrite[] {
  return JSON.parse(
    view.host.querySelector<HTMLInputElement>('[name="outline"]')!.value,
  );
}

/** Submitting invalid data must expose the first public validation category without invoking a write. */
async function rejection(initial: OutlineKindWrite[]): Promise<string> {
  const action = vi.fn();
  view = await mount(<OutlineEditor initial={initial} action={action} />);
  await act(async () => fireEvent.submit(view.host.querySelector("form")!));
  expect(action).not.toHaveBeenCalled();
  return view.host.querySelector('[role="alert"]')!.textContent!;
}

it("preserves explicit false roots and empty children while defaulting only omitted settings", async () => {
  view = await mount(
    <OutlineEditor
      initial={[leaf({ root: false }), leaf({ kindCode: "next", root: true })]}
    />,
  );
  expect(payload()[0]).toMatchObject({
    root: false,
    allowedChildKinds: [],
    sentenceDelimiters: [".", "!", "?"],
  });
  expect(payload()[0]).not.toHaveProperty("existing");
  expect(payload()[0]).not.toHaveProperty("delimiterInput");
});

it("reports required names before duplicate codes, root and sentence configuration failures", async () => {
  expect(
    await rejection([
      leaf({
        displayLabel: "",
        root: false,
        segmentation: "sentence",
        sentenceDelimiters: [],
      }),
      leaf({ root: false }),
    ]),
  ).toBe("Give every level a name and a generated code.");
});

it("reports duplicate codes before missing roots or invalid sentence settings", async () => {
  expect(
    await rejection([
      leaf({ root: false, segmentation: "sentence", sentenceDelimiters: [] }),
      leaf({ root: false }),
    ]),
  ).toBe(
    "Each level needs a different code. Change a level name or its code under Advanced.",
  );
});

it("reports missing roots before unknown child kinds and sentence settings", async () => {
  expect(
    await rejection([
      leaf({
        root: false,
        allowedChildKinds: ["unknown"],
        segmentation: "sentence",
        sentenceDelimiters: [],
      }),
    ]),
  ).toContain("top-level");
});

it("reports unknown child kinds before invalid sentence delimiters", async () => {
  expect(
    await rejection([
      leaf({
        allowedChildKinds: ["unknown"],
        segmentation: "sentence",
        sentenceDelimiters: [],
      }),
    ]),
  ).toContain("child kind");
});

it("counts Unicode punctuation by code points when validating sentence delimiters", async () => {
  const action = vi.fn().mockRejectedValue(new Error("expected save failure"));
  view = await mount(
    <OutlineEditor
      initial={[
        leaf({
          segmentation: "sentence",
          sentenceDelimiters: ["😀".repeat(8)],
        }),
      ]}
      action={action}
    />,
  );
  await act(async () => fireEvent.submit(view.host.querySelector("form")!));
  expect(action).toHaveBeenCalledTimes(1);
  await change(
    view.host.querySelector('[name="sentence-delimiters-0"]')!,
    "😀".repeat(9),
  );
  await act(async () => fireEvent.submit(view.host.querySelector("form")!));
  expect(action).toHaveBeenCalledTimes(1);
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain(
    "distinct punctuation sequences",
  );
});

it("retains a focused existing identity field when its displayed label changes", async () => {
  view = await mount(
    <OutlineEditor constitutionId="constitution" initial={[leaf()]} />,
  );
  const field = view.host.querySelector<HTMLInputElement>('[name="label-0"]')!;
  field.focus();
  await change(field, "Updated visible name");
  expect(document.activeElement).toBe(field);
  expect(payload()[0]).toMatchObject({
    kindCode: "clause",
    displayLabel: "Updated visible name",
  });
});

it("does not create from an implicit Enter submission on the final review stage", async () => {
  const action = vi.fn().mockRejectedValue(new Error("expected save failure"));
  view = await mount(
    <OutlineEditor initial={[leaf()]} guidedCreation action={action}>
      <input name="title" defaultValue="Charter" />
    </OutlineEditor>,
  );
  await click(button(view.host, "Continue to structure"));
  await click(button(view.host, "Continue to review"));
  await act(async () => fireEvent.submit(view.host.querySelector("form")!));
  expect(action).not.toHaveBeenCalled();
  await click(button(view.host, "Create constitution"));
  expect(action).toHaveBeenCalledTimes(1);
  expect((action.mock.calls[0][0] as FormData).get("title")).toBe("Charter");
});

it("shows effective inline labels on a text leaf in the final review summary", async () => {
  view = await mount(
    <OutlineEditor
      initial={[leaf({ labelPlacement: "inline", showTitle: false })]}
      guidedCreation
    >
      <input name="title" defaultValue="Charter" />
    </OutlineEditor>,
  );
  await click(button(view.host, "Continue to structure"));
  await click(button(view.host, "Continue to review"));
  const review = view.host.querySelector(
    '[aria-label="Final structure settings"]',
  )!;
  expect(review.textContent).toContain("shown (Inline with text)");
});
