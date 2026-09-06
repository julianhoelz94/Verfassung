import type { ContentNode } from './api';

export type DiffSeg = {
  type: 'equal' | 'add' | 'remove';
  text: string;
};

export type AlignedNode = {
  left?: ContentNode;
  right?: ContentNode;
};

const SENTENCE_SPLIT = /(?<=[.!?])(?:\s+|$)/;
const WORD_SPLIT = /(\s+)/;

export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const parts = trimmed.split(SENTENCE_SPLIT).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export function diffTokens(left: string[], right: string[]): DiffSeg[] {
  const n = left.length;
  const m = right.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const segs: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      pushSeg(segs, 'equal', left[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      pushSeg(segs, 'remove', left[i]);
      i += 1;
    } else {
      pushSeg(segs, 'add', right[j]);
      j += 1;
    }
  }
  while (i < n) {
    pushSeg(segs, 'remove', left[i]);
    i += 1;
  }
  while (j < m) {
    pushSeg(segs, 'add', right[j]);
    j += 1;
  }
  return segs;
}

export function diffText(left: string, right: string): DiffSeg[] {
  if (left === right) {
    return left ? [{ type: 'equal', text: left }] : [];
  }
  const leftSentences = splitSentences(left);
  const rightSentences = splitSentences(right);
  if (leftSentences.length <= 1 && rightSentences.length <= 1) {
    return joinWordDiff(left, right);
  }
  const sentenceDiff = diffTokens(leftSentences, rightSentences);
  const merged: DiffSeg[] = [];
  for (let index = 0; index < sentenceDiff.length; index += 1) {
    const current = sentenceDiff[index];
    const next = sentenceDiff[index + 1];
    if (current.type === 'remove' && next?.type === 'add') {
      joinWordDiff(current.text, next.text).forEach((part) => pushSeg(merged, part.type, part.text));
      index += 1;
      continue;
    }
    if (current.type === 'equal') {
      pushSeg(merged, 'equal', current.text);
    } else {
      pushSeg(merged, current.type, current.text);
    }
  }
  return merged.map((seg, index) => ({
    ...seg,
    text: index === 0 ? seg.text : prefixSpace(seg),
  }));
}

export function segsForSide(segs: DiffSeg[], side: 'from' | 'to'): DiffSeg[] {
  return segs.filter((seg) => {
    if (seg.type === 'equal') {
      return true;
    }
    if (side === 'from') {
      return seg.type === 'remove';
    }
    return seg.type === 'add';
  });
}

export function alignNodes(left: ContentNode[] = [], right: ContentNode[] = []): AlignedNode[] {
  const usedRight = new Set<number>();
  const pairs: AlignedNode[] = [];
  for (const node of left) {
    const matchIndex = right.findIndex((candidate, index) => !usedRight.has(index) && sameNode(node, candidate));
    if (matchIndex >= 0) {
      usedRight.add(matchIndex);
      pairs.push({ left: node, right: right[matchIndex] });
    } else {
      pairs.push({ left: node });
    }
  }
  right.forEach((node, index) => {
    if (!usedRight.has(index)) {
      pairs.push({ right: node });
    }
  });
  return pairs;
}

function sameNode(left: ContentNode, right: ContentNode): boolean {
  if (left.id && right.id && left.id === right.id) {
    return true;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  const leftKey = left.label ?? left.number ?? '';
  const rightKey = right.label ?? right.number ?? '';
  return leftKey !== '' && leftKey === rightKey;
}

function joinWordDiff(left: string, right: string): DiffSeg[] {
  const leftParts = left.split(WORD_SPLIT).filter((part) => part.length > 0);
  const rightParts = right.split(WORD_SPLIT).filter((part) => part.length > 0);
  return diffTokens(leftParts, rightParts);
}

function pushSeg(segs: DiffSeg[], type: DiffSeg['type'], text: string) {
  if (!text) {
    return;
  }
  const last = segs[segs.length - 1];
  if (last && last.type === type) {
    last.text += type === 'equal' && !last.text.endsWith(' ') && !text.startsWith(' ') ? ` ${text}` : text;
    return;
  }
  segs.push({ type, text });
}

function prefixSpace(seg: DiffSeg): string {
  if (seg.text.startsWith(' ') || seg.text.startsWith('\n')) {
    return seg.text;
  }
  return ` ${seg.text}`;
}
