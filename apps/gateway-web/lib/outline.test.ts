import { describe, expect, it } from 'vitest';
import { articleHeading, clipNodes, concatenatedText, depthStopCount, depthStopLabels, groupNodes, nodeHeading, toOutlineKindWrite } from './outline';
import type { ContentNode, ContentOutline } from './api';

const de: ContentOutline = {
  kinds: [
    {
      kindCode: 'article',
      displayLabel: 'Article',
      sortOrder: 1,
      mayHoldText: true,
      mayHoldChildren: true,
      allowedChildKinds: ['paragraph'],
      presentation: 'section',
      showLabel: true,
      showTitle: true,
      showKind: true,
    },
    {
      kindCode: 'paragraph',
      displayLabel: 'Paragraph',
      sortOrder: 2,
      mayHoldText: true,
      mayHoldChildren: true,
      allowedChildKinds: ['sentence'],
      presentation: 'section',
      showLabel: true,
      showTitle: true,
      showKind: false,
    },
    {
      kindCode: 'sentence',
      displayLabel: 'Sentence',
      sortOrder: 3,
      mayHoldText: true,
      mayHoldChildren: false,
      allowedChildKinds: [],
      presentation: 'concatenated',
      showLabel: false,
      showTitle: false,
      showKind: false,
    },
  ],
};

describe('nodeHeading', () => {
  it('uses outline flags for articles and paragraphs', () => {
    expect(
      nodeHeading(de.kinds[0], { kind: 'article', label: '1', number: '1', title: 'Human dignity' }),
    ).toBe('Article 1 — Human dignity');
    expect(nodeHeading(de.kinds[1], { kind: 'paragraph', label: '(1)', number: null, title: null })).toBe('(1)');
    expect(
      nodeHeading(de.kinds[1], { kind: 'paragraph', label: '(1)', number: null, title: 'Dignity of the person' }),
    ).toBe('(1) — Dignity of the person');
    expect(nodeHeading(de.kinds[2], { kind: 'sentence', label: '1', number: null, title: null })).toBeNull();
  });
});

describe('articleHeading', () => {
  it('uses the top outline kind', () => {
    expect(articleHeading(de, { articleNumber: '1', title: 'Human dignity', kind: 'article' })).toBe(
      'Article 1 — Human dignity',
    );
  });
});

describe('toOutlineKindWrite', () => {
  it('coerces concatenated presentation and clears heading flags', () => {
    expect(
      toOutlineKindWrite({
        kindCode: 'sentence',
        displayLabel: 'Sentence',
        presentation: 'concatenated',
        showLabel: true,
        showTitle: true,
        showKind: true,
      }),
    ).toEqual({
      kindCode: 'sentence',
      displayLabel: 'Sentence',
      presentation: 'concatenated',
      showLabel: false,
      showTitle: false,
      showKind: false,
    });
  });
});

describe('groupNodes', () => {
  it('concatenates consecutive sentence nodes', () => {
    const groups = groupNodes(
      [
        {
          id: 'a',
          kind: 'sentence',
          label: '1',
          number: null,
          title: null,
          body: 'First.',
          sortOrder: 1,
          children: [],
        },
        {
          id: 'b',
          kind: 'sentence',
          label: '2',
          number: null,
          title: null,
          body: 'Second.',
          sortOrder: 2,
          children: [],
        },
      ],
      de,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('concatenated');
    if (groups[0]?.type === 'concatenated') {
      expect(concatenatedText(groups[0].nodes)).toBe('First. Second.');
    }
  });
});

const paragraph: ContentNode = {
  id: 'p1',
  kind: 'paragraph',
  label: '(1)',
  number: null,
  title: null,
  body: null,
  sortOrder: 1,
  children: [
    {
      id: 's1',
      kind: 'sentence',
      label: '1',
      number: null,
      title: null,
      body: 'Human dignity shall be inviolable.',
      sortOrder: 1,
      children: [],
    },
  ],
};

describe('depth stops', () => {
  it('always includes overview and full text', () => {
    expect(depthStopCount(de)).toBe(3);
    expect(depthStopLabels(de)).toEqual(['Overview', 'Paragraph', 'Full text']);
    expect(depthStopCount({ kinds: [] })).toBe(2);
    expect(depthStopLabels({ kinds: [] })).toEqual(['Overview', 'Full text']);
  });
});

describe('clipNodes', () => {
  it('hides paragraphs and text at overview', () => {
    expect(clipNodes([paragraph], de, 1)).toEqual([]);
  });

  it('keeps paragraph headings without sentence text at the middle stop', () => {
    expect(clipNodes([paragraph], de, 2)).toEqual([
      {
        ...paragraph,
        body: null,
        children: [],
      },
    ]);
  });

  it('keeps concatenated sentences at full text', () => {
    const clipped = clipNodes([paragraph], de, 3);
    expect(clipped).toHaveLength(1);
    expect(clipped[0]?.children).toHaveLength(1);
    expect(clipped[0]?.children[0]?.body).toBe('Human dignity shall be inviolable.');
  });

  it('hides nested nodes at overview when there is no outline', () => {
    expect(clipNodes([paragraph], { kinds: [] }, 1)).toEqual([]);
    expect(clipNodes([paragraph], { kinds: [] }, 2)[0]?.children[0]?.body).toBe(
      'Human dignity shall be inviolable.',
    );
  });
});
