import type {
  ContentOutline,
  OrderedInlineReference,
  OrderedTextMark,
} from "../../lib/api";
import {
  blockOf,
  canvasSignature,
  cleanSentenceBlock,
  cleanSentenceLayout,
  normalizeMarks,
  sliceBlock,
  type CanvasBlock,
  type CanvasUnit,
} from "../../lib/continuous-editor";
import {
  findNode,
  nodes,
  token,
  type DraftEntry,
  type DraftNode,
  type DraftOperation,
} from "../../lib/structured-editor";

/** Transaction callbacks resolve current roots after every emitted operation, never from a stale render. */
export type CanvasReconciliationContext = {
  units: CanvasUnit[];
  blocks: CanvasBlock[];
  parentId: string | null;
  entriesOnly: boolean;
  outline: ContentOutline;
  eligible: (level: ContentOutline["kinds"][number]) => boolean;
  emit: (operation: Omit<DraftOperation, "id">) => DraftOperation;
  current: () => DraftNode[];
};

/** Plans the original ordered merge/split/move sequence inside the caller's atomic editor transaction. */
export function reconcileCanvasOperations(
  context: CanvasReconciliationContext,
): void {
  new CanvasReconciliation(context).run();
}

/** One input event's identity/layout bookkeeping, discarded when its transaction completes or fails. */
class CanvasReconciliation {
  private automatic = false;
  private touched = new Set<string>();
  private plannedLayout = new Map<string, number>();
  private existing = new Map<string, CanvasUnit>();
  private retained = new Set<string>();
  private handled = new Set<string>();
  private targetReplacements = new Map<string, string>();

  constructor(private readonly context: CanvasReconciliationContext) {}

  /** Existing blocks are reconciled before unmatched removals and final automatic sentence layout. */
  run(): void {
    this.initialize();
    for (let index = 0; index < this.context.blocks.length; index++)
      index = this.reconcileBlock(index);
    this.removeRemaining();
    this.cleanLayout();
  }

  /** Computes touched runs before emitting changes so authored separators use the original input snapshot. */
  private initialize(): void {
    const { units, blocks, entriesOnly, outline, eligible } = this.context;
    this.automatic =
      !entriesOnly &&
      eligible(
        outline.kinds.find((level) => level.kindCode === units[0].node.kind)!,
      );
    this.touched = new Set(
      blocks
        .filter((block) => {
          const old = units.find(
            (unit) => unit.entry.logicalId === block.textId,
          );
          return (
            !old || canvasSignature([blockOf(old)]) !== canvasSignature([block])
          );
        })
        .map((block) => block.textId),
    );
    this.plannedLayout = new Map(
      (this.automatic ? cleanSentenceLayout(blocks, this.touched) : blocks).map(
        (block) => [block.textId, block.lineBreaksBefore ?? 0],
      ),
    );
    this.existing = new Map(units.map((unit) => [this.identity(unit), unit]));
    this.retained = new Set(blocks.map((block) => this.blockIdentity(block)));
  }

  /** Entry-only canvases identify text runs; automatic leaf canvases identify their owning units. */
  private identity(unit: CanvasUnit): string {
    return this.context.entriesOnly
      ? unit.entry.logicalId!
      : unit.node.logicalId;
  }
  /** Canvas identities use the same ownership rule as their original units. */
  private blockIdentity(block: CanvasBlock): string {
    return this.context.entriesOnly ? block.textId : block.nodeId;
  }
  /** Every read observes earlier operations already emitted within this transaction. */
  private entryIn(id: string): DraftEntry {
    return nodes(this.context.current())
      .flatMap((node) => node.content)
      .find((entry) => entry.logicalId === id)!;
  }

  /** A retained block may absorb removed siblings, then split into newly created following blocks. */
  private reconcileBlock(index: number): number {
    const { blocks } = this.context;
    const block = blocks[index],
      old = this.existing.get(this.blockIdentity(block));
    if (!old) return index;
    const removed = this.followingRemoved(old);
    const suffix = removed.map((unit) => unit.entry.text ?? "").join("");
    const mergeText = block.text.endsWith(suffix)
      ? block.text
      : this.automatic
        ? block.text.trimEnd()
        : block.text;
    if (removed.length && suffix && mergeText.endsWith(suffix))
      this.mergeRemoved(old, removed, block, mergeText, suffix);
    const parts = [block];
    while (
      index + 1 < blocks.length &&
      !this.existing.has(this.blockIdentity(blocks[index + 1]))
    )
      parts.push(blocks[++index]);
    const combined = combineCanvasBlocks(parts);
    combined.references = combined.references.map((reference) =>
      this.remapReference(reference),
    );
    this.replace(
      this.entryIn(old.entry.logicalId!),
      this.replacement(block, combined, parts.length),
    );
    if (parts.length > 1) this.splitBlock(old, parts);
    if (!this.context.entriesOnly && parts.length > 1)
      this.moveNotes(old.node.logicalId, parts.at(-1)!.nodeId);
    this.handled.add(this.identity(old));
    return index;
  }

  /** Only consecutive removed siblings after this retained unit participate in an implicit merge. */
  private followingRemoved(old: CanvasUnit): CanvasUnit[] {
    const removed: CanvasUnit[] = [],
      oldAt = this.context.units.indexOf(old);
    for (
      let position = oldAt + 1;
      position < this.context.units.length &&
      !this.retained.has(this.identity(this.context.units[position]));
      position++
    )
      removed.push(this.context.units[position]);
    return removed;
  }

  /** Merge exact source slices first; only the final replacement cleans automatic leaf whitespace. */
  private mergeRemoved(
    old: CanvasUnit,
    removed: CanvasUnit[],
    block: CanvasBlock,
    mergeText: string,
    suffix: string,
  ): void {
    const { entriesOnly, emit, current } = this.context;
    if (removed.some((unit) => unit.node.label || unit.node.title))
      throw new Error(
        "A titled or labelled unit must not be merged implicitly",
      );
    const prefix = sliceBlock(block, 0, mergeText.length - suffix.length);
    const movedReferences = new Set(
      removed
        .flatMap((unit) => unit.entry.references ?? [])
        .map((reference) => reference.logicalId),
    );
    prefix.references = prefix.references.filter(
      (reference) => !movedReferences.has(reference.logicalId),
    );
    this.replace(this.entryIn(old.entry.logicalId!), prefix);
    if (!entriesOnly)
      for (const unit of removed) {
        const destination = findNode(current(), old.node.logicalId)!;
        emit({
          type: "move",
          targetId: unit.entry.logicalId!,
          expectedRevisionId: token(this.entryIn(unit.entry.logicalId!)),
          destinationParentId: destination.logicalId,
          destinationRevisionId: token(destination),
          position: destination.content.length,
        });
      }
    emit({
      type: "merge_text",
      targetId: old.entry.logicalId!,
      expectedRevisionId: token(this.entryIn(old.entry.logicalId!)),
      mergeIds: [
        old.entry.logicalId!,
        ...removed.map((unit) => unit.entry.logicalId!),
      ],
      parts: [{ logicalId: old.entry.logicalId!, text: mergeText }],
    });
    if (!entriesOnly)
      for (const unit of removed)
        this.moveNotes(unit.node.logicalId, old.node.logicalId);
    if (!entriesOnly)
      for (const unit of removed)
        emit({
          type: "remove",
          targetId: unit.node.logicalId,
          expectedRevisionId: token(findNode(current(), unit.node.logicalId)!),
          replacementId: old.node.logicalId,
        });
    removed.forEach((unit) => {
      this.handled.add(this.identity(unit));
      this.targetReplacements.set(unit.entry.logicalId!, old.entry.logicalId!);
      if (!entriesOnly)
        this.targetReplacements.set(unit.node.logicalId, old.node.logicalId);
    });
  }

  /** Moves note bodies in their current stored order, recalculating destination revisions after each move. */
  private moveNotes(sourceId: string, destinationId: string): void {
    const { current, emit } = this.context;
    for (const note of findNode(current(), sourceId)!.content.filter(
      (entry) => entry.format === "footnote",
    )) {
      const destination = findNode(current(), destinationId)!;
      emit({
        type: "move",
        targetId: note.logicalId!,
        expectedRevisionId: token(note),
        destinationParentId: destination.logicalId,
        destinationRevisionId: token(destination),
        position: destination.content.length,
      });
    }
  }

  /** Unit references follow chained implicit replacements; cyclic historical identities terminate safely. */
  private remapReference(
    reference: OrderedInlineReference,
  ): OrderedInlineReference {
    if (reference.target.type !== "unit" || !reference.target.logicalId)
      return reference;
    let target = reference.target.logicalId;
    const visited = new Set<string>();
    while (this.targetReplacements.has(target) && !visited.has(target)) {
      visited.add(target);
      target = this.targetReplacements.get(target)!;
    }
    return target === reference.target.logicalId
      ? reference
      : { ...reference, target: { ...reference.target, logicalId: target } };
  }

  /** Only touched, unsplit automatic blocks receive immediate whitespace/layout normalization. */
  private replacement(
    block: CanvasBlock,
    combined: CanvasBlock,
    count: number,
  ): CanvasBlock {
    return count === 1 && this.automatic && this.touched.has(block.textId)
      ? {
          ...cleanSentenceBlock(combined),
          lineBreaksBefore: this.plannedLayout.get(block.textId) ?? 0,
        }
      : combined;
  }

  /** Split text precedes sibling creation and movement so every expected revision pins the prior emitted step. */
  private splitBlock(old: CanvasUnit, parts: CanvasBlock[]): void {
    const { emit, current, entriesOnly, parentId } = this.context;
    parts.forEach((part) => this.touched.add(part.textId));
    const split = emit({
      type: "split_text",
      targetId: old.entry.logicalId!,
      expectedRevisionId: token(this.entryIn(old.entry.logicalId!)),
      parts: parts.map((part) => ({ logicalId: part.textId, text: part.text })),
    });
    if (!entriesOnly)
      for (let part = 1; part < parts.length; part++) {
        const parent = parentId ? findNode(current(), parentId)! : null;
        const at = parent
          ? parent.content.findIndex(
              (entry) => entry.node?.logicalId === old.node.logicalId,
            ) + part
          : current().findIndex(
              (node) => node.logicalId === old.node.logicalId,
            ) + part;
        const node: DraftNode = {
          logicalId: parts[part].nodeId,
          kind: old.node.kind,
          label: null,
          title: null,
          content: [],
        };
        emit({
          type: parent ? "insert_child" : "insert_root",
          targetId: parent?.logicalId ?? current()[0].logicalId,
          expectedRevisionId: token(parent ?? current()[0]),
          position: at,
          node,
        });
        const inserted = findNode(current(), node.logicalId)!;
        emit({
          type: "move",
          targetId: parts[part].textId,
          expectedRevisionId: split.id,
          destinationParentId: inserted.logicalId,
          destinationRevisionId: token(inserted),
          position: 0,
        });
      }
  }

  /** Unhandled missing units are removed after all retained blocks have been reconciled. */
  private removeRemaining(): void {
    const { units, entriesOnly, emit, current } = this.context;
    for (const unit of units)
      if (
        !this.retained.has(this.identity(unit)) &&
        !this.handled.has(this.identity(unit))
      )
        emit({
          type: "remove",
          targetId: this.identity(unit),
          expectedRevisionId: token(
            entriesOnly
              ? this.entryIn(unit.entry.logicalId!)
              : findNode(current(), unit.node.logicalId)!,
          ),
        });
  }

  /** Final automatic normalization uses current rich data while preserving all intended separators. */
  private cleanLayout(): void {
    if (!this.automatic) return;
    for (const block of cleanSentenceLayout(
      this.context.blocks,
      this.touched,
    )) {
      const entry = this.entryIn(block.textId),
        rich = {
          ...block,
          text: entry.text ?? "",
          marks: entry.marks ?? [],
          references: entry.references ?? [],
        };
      this.replace(entry, {
        ...(this.touched.has(block.textId) ? cleanSentenceBlock(rich) : rich),
        lineBreaksBefore: block.lineBreaksBefore ?? 0,
      });
    }
  }

  /** Emits only an actual rich payload change, preserving the original JSON comparison and defaults. */
  private replace(
    entry: DraftEntry,
    block: Pick<
      CanvasBlock,
      "text" | "marks" | "references" | "lineBreaksBefore"
    >,
  ): void {
    const rich = {
      text: block.text,
      format: "plain" as const,
      marks: block.marks,
      references: block.references,
      lineBreaksBefore: block.lineBreaksBefore ?? entry.lineBreaksBefore ?? 0,
    };
    if (
      JSON.stringify({
        text: entry.text ?? "",
        format: entry.format ?? "plain",
        marks: entry.marks ?? [],
        references: entry.references ?? [],
        lineBreaksBefore: entry.lineBreaksBefore ?? 0,
      }) !== JSON.stringify(rich)
    )
      this.context.emit({
        type: "replace_text",
        targetId: entry.logicalId!,
        expectedRevisionId: token(entry),
        ...rich,
      });
  }
}

/** Concatenates exact text and offsets each part's marks/references without adding separators. */
function combineCanvasBlocks(parts: CanvasBlock[]): CanvasBlock {
  let offset = 0;
  const marks: OrderedTextMark[] = [],
    references: OrderedInlineReference[] = [];
  for (const part of parts) {
    marks.push(
      ...part.marks.map((mark) => ({
        ...mark,
        start: mark.start + offset,
        end: mark.end + offset,
      })),
    );
    references.push(
      ...part.references.map((reference) => ({
        ...reference,
        start: reference.start + offset,
        end: reference.end + offset,
      })),
    );
    offset += part.text.length;
  }
  return {
    ...parts[0],
    text: parts.map((part) => part.text).join(""),
    marks: normalizeMarks(marks),
    references,
  };
}
