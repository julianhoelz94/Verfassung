import { expect, it } from "vitest";
import {
  constitutionTemplates,
  outlineFromTemplate,
} from "./constitution-templates";
import {
  explicitLayers,
  outlineValidationError,
  outlineBranches,
} from "../app/admin/constitutions/outline-editor-model";
import { outlineExample } from "./outline-preview";
import { setupOutline } from "./setup-review";
import type { OrderedNode } from "./api";

it("offers five independent, editable and valid constitutional structure graphs with official references", () => {
  expect(constitutionTemplates).toHaveLength(5);
  for (const preset of constitutionTemplates) {
    const kinds = outlineFromTemplate(preset.id),
      layers = explicitLayers(kinds, false);
    expect(outlineValidationError(layers)).toBeNull();
    expect(outlineBranches(layers).every((branch) => !branch.unplaced)).toBe(
      true,
    );
    const represented = new Set<string>();
    function visit(nodes: OrderedNode[]) {
      for (const node of nodes) {
        represented.add(node.kind);
        visit(
          node.content.flatMap((entry) => (entry.node ? [entry.node] : [])),
        );
      }
    }
    visit(outlineExample(setupOutline(kinds)));
    expect([...represented].sort()).toEqual(
      kinds.map((kind) => kind.kindCode).sort(),
    );
    expect(preset.source).toMatch(/^https:\/\//);
    kinds[0].displayLabel = "Changed";
    kinds[0].allowedChildKinds?.push("invalid");
    expect(outlineFromTemplate(preset.id)[0].displayLabel).not.toBe("Changed");
    expect(
      outlineValidationError(
        explicitLayers(outlineFromTemplate(preset.id), false),
      ),
    ).toBeNull();
  }
});
