import { afterEach, expect, it } from "vitest";
import { getByRole, queryByRole } from "@testing-library/dom";
import { mount, click } from "../../test/dom";
import { DocumentView } from "./DocumentViewOptions";
import { readerPreferenceSnapshot } from "../../lib/reader-preferences";
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  if (view) await view.close();
  localStorage.clear();
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
