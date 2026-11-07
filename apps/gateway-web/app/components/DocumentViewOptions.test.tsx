import { afterEach, expect, it, vi } from "vitest";
import { getByRole, queryByRole } from "@testing-library/dom";
import { mount, click, change } from "../../test/dom";
import { DocumentView, ReadingPreferenceControls } from "./DocumentViewOptions";
import { readReaderPreferences } from "../../lib/reader";
import { readerPreferenceSnapshot } from "../../lib/reader-preferences";
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  if (view) await view.close();
  localStorage.clear();
});
it("shares labelled text-size and layout controls while leaving host-specific options intact", async () => {
  const onChange = vi.fn();
  const preferences = readReaderPreferences(null);
  view = await mount(<ReadingPreferenceControls value={preferences} onChange={onChange}>
    <label>Detail level<select defaultValue="full"><option value="full">Full text</option></select></label>
  </ReadingPreferenceControls>);
  await change(getByRole(view.host, "combobox", {name: "Text size"}) as HTMLSelectElement, "20");
  expect(onChange).toHaveBeenCalledWith({size: "20"});
  await click(getByRole(view.host, "checkbox", {name: "Show indentation"}));
  expect(onChange).toHaveBeenCalledWith({indentation: false});
  expect(getByRole(view.host, "combobox", {name: "Detail level"})).toBeTruthy();
  await view.render(<ReadingPreferenceControls value={{...preferences, size: "20"}} onChange={onChange} hierarchy={false} />);
  expect(queryByRole(view.host, "checkbox")).toBeNull();
  expect((getByRole(view.host, "combobox", {name: "Text size"}) as HTMLSelectElement).value).toBe("20");
});
it("hides guides when indentation is off, preserving the last guide choice and the open menu", async () => {
  view = await mount(
    <DocumentView scope="reader">
      <p>Unchanged legal text.</p>
    </DocumentView>,
  );
  const details = view.host.querySelector("details")!;
  await click(details.querySelector("summary")!);
  await click(
    getByRole(view.host, "checkbox", { name: "Show hierarchy guides" }),
  );
  await click(getByRole(view.host, "checkbox", { name: "Show indentation" }));
  expect(
    queryByRole(view.host, "checkbox", { name: "Show hierarchy guides" }),
  ).toBeNull();
  expect(
    view.host
      .querySelector("[data-hierarchy-guides]")
      ?.getAttribute("data-hierarchy-guides"),
  ).toBe("false");
  expect(details.open).toBe(true);
  await click(getByRole(view.host, "checkbox", { name: "Show indentation" }));
  expect(
    (
      getByRole(view.host, "checkbox", {
        name: "Show hierarchy guides",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(view.host.textContent).toContain("Unchanged legal text.");
});
it("keeps active editor layout choices separate from shared viewer/preview preferences", async () => {
  view = await mount(
    <DocumentView scope="editor">
      <p>Draft text.</p>
    </DocumentView>,
  );
  await click(view.host.querySelector("summary")!);
  await click(getByRole(view.host, "checkbox", { name: "Show indentation" }));
  expect(JSON.parse(readerPreferenceSnapshot("editor")).indentation).toBe(
    false,
  );
  expect(JSON.parse(readerPreferenceSnapshot("reader")).indentation).toBe(true);
  await view.render(
    <DocumentView scope="reader">
      <p>Preview text.</p>
    </DocumentView>,
  );
  expect(
    view.host
      .querySelector("[data-hierarchy-indentation]")
      ?.getAttribute("data-hierarchy-indentation"),
  ).toBe("true");
});
