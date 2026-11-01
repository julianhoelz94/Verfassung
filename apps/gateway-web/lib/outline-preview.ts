import type { ContentOutline, OrderedEntry, OrderedNode } from "./api";
import { effectiveDisplayKind, kindByCode, type OutlineKind } from "./outline";
import { ui, type UiMessage } from "./messages";

type Translate = (value: UiMessage) => string;
const english: Translate = (value) => value.en;

/** Explains effective reader display and authored editor policy in fixed annotation order. */
export function outlineUnitDetails(
  kind: OutlineKind,
  outline: ContentOutline,
  t: Translate = english,
): string[] {
  const effective = effectiveDisplayKind(kind)!;
  const children = kind.allowedChildKinds ?? [];
  const labels = ui.admin.constitutions.outlineeditor;
  const details = ui.outlinePreview;
  const policy = (value: string | undefined) =>
    t(
      value === "none"
        ? labels.notAllowed
        : value === "required"
          ? labels.required
          : labels.optional,
    );
  const placement =
    effective.labelPlacement === "superscript"
      ? details.labelSuperscript
      : effective.labelPlacement === "inline"
        ? details.labelInline
        : effective.labelPlacement === "after_title"
          ? details.labelAfter
          : details.labelBefore;
  return [
    children.length
      ? t(details.structural).replace(
          "{children}",
          children
            .map((code) => kindByCode(outline, code)?.displayLabel ?? code)
            .join(", "),
        )
      : t(details.leaf),
    t(
      effective.presentation === "concatenated"
        ? details.readerRunning
        : details.readerBlock,
    ),
    t(details.kindAndTitle)
      .replace(
        "{kind}",
        t(
          effective.showKind
            ? ui.outlineDynamic.shown
            : ui.outlineDynamic.hidden,
        ),
      )
      .replace(
        "{title}",
        t(
          effective.showTitle
            ? details.titleWhenPresent
            : ui.outlineDynamic.hidden,
        ),
      ),
    t(details.legalLabel).replace(
      "{label}",
      t(effective.showLabel ? placement : ui.outlineDynamic.hidden),
    ),
    t(details.editorPolicies)
      .replace("{titles}", policy(kind.titlePolicy))
      .replace("{labels}", policy(kind.labelPolicy)),
    t(
      children.length
        ? kind.allowTextAlongsideChildren
          ? details.parentText
          : details.childText
        : kind.segmentation === "sentence"
          ? details.sentenceEditing
          : details.plainEditing,
    ),
  ];
}

/** Creates deterministic illustrative roots without mutating authored outline settings. */
export function outlineExample(
  outline: ContentOutline,
  t: Translate = english,
): OrderedNode[] {
  return new OutlineExampleBuilder(outline, t).roots();
}

/** Path-local cycle guards allow the same child kind on independent branches. */
class OutlineExampleBuilder {
  constructor(
    private readonly outline: ContentOutline,
    private readonly t: Translate,
  ) {}

  /** Only explicitly rooted kinds become examples, in their existing outline order. */
  roots(): OrderedNode[] {
    return this.outline.kinds
      .filter((kind) => kind.root)
      .map((kind, index) =>
        this.node(kind.kindCode, `sample-${index}`, index, new Set()),
      )
      .filter((item): item is OrderedNode => Boolean(item));
  }

  /** Containers never join running text, even if their display presentation is concatenated. */
  private isRunningLeaf(kindCode: string): boolean {
    const kind = kindByCode(this.outline, kindCode);
    return (
      effectiveDisplayKind(kind)?.presentation === "concatenated" &&
      !kind?.allowedChildKinds?.length
    );
  }

  /** Node identities, metadata and sibling numbering retain the original preview contract. */
  private node(
    kindCode: string,
    path: string,
    sibling: number,
    ancestors: Set<string>,
  ): OrderedNode | null {
    const kind = kindByCode(this.outline, kindCode);
    if (!kind || ancestors.has(kindCode)) return null;
    const content = this.content(kind, path, sibling, ancestors);
    return {
      logicalId: path,
      revisionId: path,
      occurrenceId: path,
      kind: kind.kindCode,
      label: this.label(kind, sibling),
      title: this.title(kind, sibling),
      content,
    };
  }

  /** Authored label policies and root status take precedence over sibling numbering. */
  private label(kind: OutlineKind, sibling: number): string | null {
    return kind.labelPolicy === "none"
      ? null
      : kind.root
        ? "46a"
        : sibling === 0
          ? "(1)"
          : sibling === 1
            ? "(2a)"
            : `(${sibling + 1})`;
  }

  /** Optional titles are demonstrated on the first sibling only, using supplied translation. */
  private title(kind: OutlineKind, sibling: number): string | null {
    return kind.titlePolicy === "none" ||
      (kind.titlePolicy === "optional" && sibling > 0)
      ? null
      : `${kind.displayLabel} ${this.t(ui.remainingStatus.example)}`;
  }

  /** Preserves before/between/after slots and the first running pair's contribution to sibling indices. */
  private content(
    kind: OutlineKind,
    path: string,
    sibling: number,
    ancestors: Set<string>,
  ): OrderedEntry[] {
    const children = kind.allowedChildKinds ?? [];
    const content: OrderedEntry[] = [];
    if (!children.length) {
      const sentences = [
        ui.remainingStatus.sampleEqualProtection,
        ui.remainingStatus.sampleProtectRights,
        ui.outlinePreview.sampleDignity,
        ui.outlinePreview.sampleLegalProtection,
      ];
      this.text(
        content,
        path,
        "text",
        this.t(sentences[sibling % sentences.length]!),
      );
    } else {
      if (kind.allowTextAlongsideChildren)
        this.text(
          content,
          path,
          "before",
          this.t(ui.remainingStatus.sampleFollowingRights),
        );
      const firstRunSize = this.childRun(
        content,
        kind,
        path,
        children[0]!,
        "a",
        0,
        ancestors,
      );
      if (kind.allowTextAlongsideChildren)
        this.text(
          content,
          path,
          "between",
          this.t(ui.remainingStatus.sampleRightsEveryone),
        );
      this.childRun(
        content,
        kind,
        path,
        children[1] ?? children[0]!,
        "b",
        firstRunSize,
        ancestors,
      );
      if (kind.allowTextAlongsideChildren)
        this.text(
          content,
          path,
          "after",
          this.t(ui.remainingStatus.sampleUpholdGuarantees),
        );
    }
    return content;
  }

  /** Text slots use deterministic path-derived logical and occurrence IDs. */
  private text(
    content: OrderedEntry[],
    path: string,
    position: string,
    words: string,
  ) {
    content.push({
      type: "text",
      logicalId: `${path}-${position}`,
      occurrenceId: `${path}-${position}`,
      text: words,
    });
  }

  /** Duplicate only running text leaves under mixed-content parents, not whole containers. */
  private childRun(
    content: OrderedEntry[],
    kind: OutlineKind,
    path: string,
    code: string,
    suffix: string,
    index: number,
    ancestors: Set<string>,
  ): number {
    this.child(content, kind.kindCode, path, code, suffix, index, ancestors);
    if (kind.allowTextAlongsideChildren && this.isRunningLeaf(code)) {
      this.child(
        content,
        kind.kindCode,
        path,
        code,
        `${suffix}-next`,
        index + 1,
        ancestors,
      );
      return 2;
    }
    return 1;
  }

  /** Each child receives its own ancestor set so cycles stop locally without suppressing sibling reuse. */
  private child(
    content: OrderedEntry[],
    kindCode: string,
    path: string,
    code: string,
    suffix: string,
    index: number,
    ancestors: Set<string>,
  ) {
    const result = this.node(
      code,
      `${path}-${suffix}`,
      index,
      new Set([...ancestors, kindCode]),
    );
    if (result) content.push({ type: "child", node: result });
  }
}
