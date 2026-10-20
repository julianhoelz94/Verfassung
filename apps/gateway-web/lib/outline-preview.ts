import type { ContentOutline, OrderedEntry, OrderedNode } from './api';
import { effectiveDisplayKind, kindByCode, type OutlineKind } from './outline';
import { ui, type UiMessage } from './messages';

type Translate = (value: UiMessage) => string;
const english: Translate = value => value.en;

export function outlineUnitDetails(kind: OutlineKind, outline: ContentOutline, t: Translate = english): string[] {
  const effective = effectiveDisplayKind(kind)!;
  const children = kind.allowedChildKinds ?? [];
  const labels = ui.admin.constitutions.outlineeditor;
  const details = ui.outlinePreview;
  const policy = (value: string | undefined) => t(value === 'none' ? labels.notAllowed : value === 'required' ? labels.required : labels.optional);
  const placement = effective.labelPlacement === 'superscript' ? details.labelSuperscript
    : effective.labelPlacement === 'inline' ? details.labelInline
      : effective.labelPlacement === 'after_title' ? details.labelAfter : details.labelBefore;
  return [
    children.length ? t(details.structural).replace('{children}', children.map(code => kindByCode(outline, code)?.displayLabel ?? code).join(', ')) : t(details.leaf),
    t(effective.presentation === 'concatenated' ? details.readerRunning : details.readerBlock),
    t(details.kindAndTitle).replace('{kind}', t(effective.showKind ? ui.outlineDynamic.shown : ui.outlineDynamic.hidden)).replace('{title}', t(effective.showTitle ? details.titleWhenPresent : ui.outlineDynamic.hidden)),
    t(details.legalLabel).replace('{label}', t(effective.showLabel ? placement : ui.outlineDynamic.hidden)),
    t(details.editorPolicies).replace('{titles}', policy(kind.titlePolicy)).replace('{labels}', policy(kind.labelPolicy)),
    t(children.length ? kind.allowTextAlongsideChildren ? details.parentText : details.childText
      : kind.segmentation === 'sentence' ? details.sentenceEditing : details.plainEditing),
  ];
}

export function outlineExample(outline: ContentOutline, t: Translate = english): OrderedNode[] {
  function isRunningLeaf(kindCode: string): boolean {
    const kind = kindByCode(outline, kindCode);
    return effectiveDisplayKind(kind)?.presentation === 'concatenated' && !kind?.allowedChildKinds?.length;
  }

  function node(kindCode: string, path: string, sibling: number, ancestors: Set<string>): OrderedNode | null {
    const kind = kindByCode(outline, kindCode);
    if (!kind || ancestors.has(kindCode)) return null;
    const children = kind.allowedChildKinds ?? [];
    const content: OrderedEntry[] = [];
    function text(position: string, words: string) {
      content.push({ type: 'text', logicalId: `${path}-${position}`, occurrenceId: `${path}-${position}`, text: words });
    }
    function child(code: string, suffix: string, index: number) {
      const result = node(code, `${path}-${suffix}`, index, new Set([...ancestors, kindCode]));
      if (result) content.push({ type: 'child', node: result });
    }
    function childRun(code: string, suffix: string, index: number): number {
      child(code, suffix, index);
      // Only text leaves can join; demonstrate a pair without multiplying containers.
      if (kind!.allowTextAlongsideChildren && isRunningLeaf(code)) {
        child(code, `${suffix}-next`, index + 1);
        return 2;
      }
      return 1;
    }
    if (!children.length) {
      const sentences = [ui.remainingStatus.sampleEqualProtection, ui.remainingStatus.sampleProtectRights, ui.outlinePreview.sampleDignity, ui.outlinePreview.sampleLegalProtection];
      text('text', t(sentences[sibling % sentences.length]!));
    } else {
      if (kind.allowTextAlongsideChildren) text('before', t(ui.remainingStatus.sampleFollowingRights));
      const firstRunSize = childRun(children[0]!, 'a', 0);
      if (kind.allowTextAlongsideChildren) text('between', t(ui.remainingStatus.sampleRightsEveryone));
      childRun(children[1] ?? children[0]!, 'b', firstRunSize);
      if (kind.allowTextAlongsideChildren) text('after', t(ui.remainingStatus.sampleUpholdGuarantees));
    }
    return {
      logicalId: path, revisionId: path, occurrenceId: path, kind: kind.kindCode,
      label: kind.labelPolicy === 'none' ? null : kind.root ? '46a' : sibling === 0 ? '(1)' : sibling === 1 ? '(2a)' : `(${sibling + 1})`,
      title: kind.titlePolicy === 'none' || (kind.titlePolicy === 'optional' && sibling > 0) ? null : `${kind.displayLabel} ${t(ui.remainingStatus.example)}`, content,
    };
  }
  return outline.kinds.filter(kind => kind.root).map((kind, index) => node(kind.kindCode, `sample-${index}`, index, new Set())).filter((item): item is OrderedNode => Boolean(item));
}
