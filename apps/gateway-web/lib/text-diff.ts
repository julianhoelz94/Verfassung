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
const MAX_DIFF_CELLS = 1_000_000;

export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const parts = trimmed.split(SENTENCE_SPLIT).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export function diffTokens(left: string[], right: string[]): DiffSeg[] {
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  const segs: DiffSeg[] = [];
  pushSeg(segs, 'equal', left.slice(0, start).join(''));
  const before = left.slice(start, leftEnd);
  const after = right.slice(start, rightEnd);
  // A long replacement must not allocate a quadratic matrix large enough to
  // exhaust the gateway. Coarser highlighting still preserves both texts exactly.
  if (!before.length || !after.length || (before.length + 1) * (after.length + 1) > MAX_DIFF_CELLS) {
    pushSeg(segs, 'remove', before.join(''));
    pushSeg(segs, 'add', after.join(''));
  } else {
    appendTokenDiff(segs, before, after);
  }
  pushSeg(segs, 'equal', left.slice(leftEnd).join(''));
  return segs;
}

function appendTokenDiff(segs: DiffSeg[], left: string[], right: string[]): void {
  const n = left.length;
  const m = right.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
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
}

export function diffText(left: string, right: string): DiffSeg[] {
  if (left === right) {
    return left ? [{ type: 'equal', text: left }] : [];
  }
  return joinWordDiff(left, right);
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
    last.text += text;
    return;
  }
  segs.push({ type, text });
}
