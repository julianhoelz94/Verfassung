import { describe, expect, it } from "vitest";
import type { ContentOutline } from "../../lib/api";
import {
  blockOf,
  simpleUnit,
  type CanvasBlock,
  type CanvasUnit,
} from "../../lib/continuous-editor";
import {
  applyOperation,
  type DraftNode,
  type DraftOperation,
} from "../../lib/structured-editor";
import { reconcileCanvasOperations } from "./structured-canvas-reconciliation";

const outline: ContentOutline = {
  kinds: [
    {
      kindCode: "sentence",
      displayLabel: "Sentence",
      sortOrder: 0,
      mayHoldText: true,
      mayHoldChildren: false,
      allowedChildKinds: [],
      segmentation: "sentence",
      presentation: "concatenated",
      titlePolicy: "optional",
      labelPolicy: "optional",
    },
  ],
};

/** Legal identities and revisions are fixed so ordered operation contracts remain readable. */
function leaf(id: string, text: string): DraftNode {
  return {
    logicalId: id,
    revisionId: "revision-" + id,
    kind: "sentence",
    label: null,
    title: null,
    content: [
      {
        type: "text",
        logicalId: "text-" + id,
        revisionId: "revision-text-" + id,
        text,
      },
    ],
  };
}

/** Reads updated roots after every command and retains the editor's replacement coalescing rule. */
function reconcile(
  source: DraftNode[],
  blocks: CanvasBlock[],
  entriesOnly = false,
) {
  let roots = source;
  let operations: DraftOperation[] = [];
  const units = source.map((node) => simpleUnit(node)!);
  reconcileCanvasOperations({
    units,
    blocks,
    parentId: null,
    entriesOnly,
    outline,
    eligible: () => true,
    current: () => roots,
    emit(operation) {
      const previous = operations.at(-1);
      const coalesce =
        previous &&
        previous.targetId === operation.targetId &&
        previous.type === operation.type &&
        ["replace_text", "set_metadata"].includes(operation.type);
      const command = coalesce
        ? {
            ...operation,
            id: previous.id,
            expectedRevisionId: previous.expectedRevisionId,
          }
        : { ...operation, id: "operation-" + operations.length };
      roots = applyOperation(roots, command);
      operations = coalesce
        ? [...operations.slice(0, -1), command]
        : [...operations, command];
      return command;
    },
  });
  return { roots, operations };
}

/** Creates the same canvas projection used by the mounted editor. */
function blocks(nodes: DraftNode[]): CanvasBlock[] {
  return nodes.map((node) => blockOf(simpleUnit(node) as CanvasUnit));
}

describe("ordered canvas reconciliation contracts", () => {
  it("retains untouched text and emits no synthetic history operations", () => {
    const source = [leaf("first", "First."), leaf("second", "Second.")];
    const result = reconcile(source, blocks(source));
    expect(result.roots).toEqual(source);
    expect(result.operations).toEqual([]);
  });
  it("splits exact text before inserting and moving the new sibling", () => {
    const source = [leaf("first", "First. Second.")];
    const first = { ...blocks(source)[0], text: "First. " };
    const second = {
      ...first,
      nodeId: "second",
      textId: "text-second",
      text: "Second.",
    };
    const result = reconcile(source, [first, second]);
    expect(result.roots.map((node) => node.logicalId)).toEqual([
      "first",
      "second",
    ]);
    expect(result.roots.map((node) => node.content[0].text)).toEqual([
      "First.",
      "Second.",
    ]);
    expect(result.operations.map((operation) => operation.type)).toEqual([
      "split_text",
      "insert_root",
      "move",
      "replace_text",
    ]);
    expect(result.operations[2].expectedRevisionId).toBe(
      result.operations[0].id,
    );
  });
  it("keeps source notes on the final split unit after all text movement", () => {
    const source = [leaf("first", "First. Second.")];
    source[0].content.push({
      type: "text",
      logicalId: "note",
      revisionId: "note-revision",
      format: "footnote",
      text: "Source note",
    });
    const first = { ...blocks(source)[0], text: "First. " };
    const result = reconcile(source, [
      first,
      { ...first, nodeId: "second", textId: "text-second", text: "Second." },
    ]);
    expect(result.roots[0].content.map((entry) => entry.logicalId)).toEqual([
      "text-first",
    ]);
    expect(result.roots[1].content.map((entry) => entry.logicalId)).toEqual([
      "text-second",
      "note",
    ]);
    expect(
      result.operations.find((operation) => operation.targetId === "note"),
    ).toMatchObject({ type: "move", destinationParentId: "second" });
  });
  it("merges exact slices and retains all source note bodies in order", () => {
    const source = [leaf("first", "First."), leaf("second", "Second.")];
    source[1].content.push({
      type: "text",
      logicalId: "note",
      revisionId: "note-revision",
      format: "footnote",
      text: "Source note",
    });
    const result = reconcile(source, [
      { ...blocks(source)[0], text: "First.Second." },
    ]);
    expect(result.roots).toHaveLength(1);
    expect(
      result.roots[0].content.map((entry) => [entry.logicalId, entry.text]),
    ).toEqual([
      ["text-first", "First.Second."],
      ["note", "Source note"],
    ]);
    expect(result.operations.map((operation) => operation.type)).toEqual([
      "move",
      "merge_text",
      "move",
      "remove",
    ]);
  });
  it("rejects implicit merging of labelled units before emitting a change", () => {
    const source = [
      leaf("first", "First."),
      { ...leaf("second", "Second."), label: "(2)" },
    ];
    expect(() =>
      reconcile(source, [{ ...blocks(source)[0], text: "First.Second." }]),
    ).toThrow("A titled or labelled unit must not be merged implicitly");
    expect(source[1].label).toBe("(2)");
  });
  it("removes unmatched following units when their text was not absorbed", () => {
    const source = [leaf("first", "First."), leaf("second", "Second.")];
    const result = reconcile(source, [blocks(source)[0]]);
    expect(result.roots.map((node) => node.logicalId)).toEqual(["first"]);
    expect(result.operations).toEqual([
      expect.objectContaining({
        type: "remove",
        targetId: "second",
        expectedRevisionId: "revision-second",
      }),
    ]);
  });
});
