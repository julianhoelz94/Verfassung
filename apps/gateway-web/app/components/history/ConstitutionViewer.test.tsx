import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { mount, click, change } from "../../../test/dom";
import { readerPreferenceSnapshot } from "../../../lib/reader-preferences";
import { ConstitutionViewer } from "./ConstitutionViewer";

let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => { if (view) await view.close(); localStorage.clear(); });

it("preserves chosen text size and dismisses preferences by Escape or an outside pointer", async () => {
  view = await mount(<ConstitutionViewer breadcrumbs={null} mode="compare" historyHref="/history" navigation={null}>
    <h1>Published comparison</h1>
  </ConstitutionViewer>);
  const trigger = getByRole(view.host, "button", {name: "Reading preferences"});
  await click(trigger);
  await change(getByRole(view.host, "combobox", {name: "Text size"}) as HTMLSelectElement, "20");
  expect(JSON.parse(readerPreferenceSnapshot()).size).toBe("20");
  await act(async () => { fireEvent.keyDown(document, {key: "Escape"}); });
  expect(queryByRole(view.host, "combobox", {name: "Text size"})).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await click(trigger);
  expect((getByRole(view.host, "combobox", {name: "Text size"}) as HTMLSelectElement).value).toBe("20");
  await act(async () => { fireEvent.pointerDown(getByRole(view.host, "heading", {name: "Published comparison"})); });
  expect(queryByRole(view.host, "combobox", {name: "Text size"})).toBeNull();
});

it("keeps the full Wiki panel open during outside reading interactions", async () => {
  view = await mount(<ConstitutionViewer breadcrumbs={null} mode="read" readHref="/record" historyHref="/history" navigation={null} wiki={<p>Constitution context</p>}>
    <h1>Published amendment</h1>
  </ConstitutionViewer>);
  await click(getByRole(view.host, "button", {name: "Wiki", exact: true}));
  await act(async () => { fireEvent.pointerDown(getByRole(view.host, "heading", {name: "Published amendment"})); });
  expect(getByRole(view.host, "region", {name: "Wiki"})).toBeTruthy();
  await act(async () => { fireEvent.keyDown(document, {key: "Escape"}); });
  expect(queryByRole(view.host, "region", {name: "Wiki"})).toBeNull();
});
