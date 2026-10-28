const id = (group, value) => `${group}00000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const recent = '01900000-0000-4000-8000-000000000004';
export const continuousReaderOutline = { kinds: [
  { kindCode: 'article', displayLabel: 'Article', sortOrder: 0, root: true, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['paragraph'], presentation: 'section', showLabel: true, showTitle: true, showKind: true, labelPlacement: 'before_title', titlePolicy: 'optional', labelPolicy: 'required' },
  { kindCode: 'paragraph', displayLabel: 'Paragraph', sortOrder: 1, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['clause'], presentation: 'section', showLabel: true, showTitle: false, showKind: false, labelPlacement: 'inline', titlePolicy: 'none', labelPolicy: 'required' },
  { kindCode: 'clause', displayLabel: 'Sentence', sortOrder: 2, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'concatenated', segmentation: 'sentence', showLabel: false, showTitle: false, showKind: false, labelPlacement: 'none', titlePolicy: 'none', labelPolicy: 'none' },
] };

/** Twenty independent roots exercise real scrolling, global notes and structured text fidelity. */
export function continuousReaderUnits(versionId) {
  const current = versionId === recent;
  const occurrence = n => id(current ? '051' : '052', n);
  const logical = n => id('053', n);
  const text = (n, value, extra = {}) => ({ type: 'text', logicalId: logical(n), revisionId: id(current ? '054' : '055', n), occurrenceId: occurrence(n), text: value, ...extra });
  const node = (n, kind, label, content) => ({ type: 'child', node: { logicalId: logical(n), revisionId: id(current ? '054' : '055', n), occurrenceId: occurrence(n), kind, label, title: null, content } });
  const sentence = (n, value, extra) => node(n, 'clause', null, [text(n + 1, value, extra)]);
  const notesId = logical(9999);
  return Array.from({ length: 20 }, (_, i) => {
    const number = i + 1, base = number * 100;
    const wording = number === 1 ? `Every person has ${current ? 'equal ' : ''}rights.` : `Public institutions shall respect Article ${number}.`;
    const second = number === 20 ? 'The legislature meets in public.\nThe executive remains accountable.' : 'These rights bind public authority.';
    const content = [node(base + 10, 'paragraph', '(1)', [
      sentence(base + 20, wording, { marks: [{ type: 'bold', start: 0, end: 5 }] }),
      sentence(base + 30, second, {
        marks: [{ type: 'italic', start: 0, end: 5 }],
        ...([1, 20].includes(number) ? { references: [{ logicalId: logical(base + 32), start: second.length, end: second.length, target: { type: 'footnote', footnoteId: notesId } }] } : {}),
      }),
    ])];
    if (number === 2) content.push(text(base + 40, 'See the public record.', { references: [{ logicalId: logical(base + 41), start: 8, end: 21, target: { type: 'external', url: 'https://example.org/public-record' } }] }));
    if (number === 3) content.push(text(base + 40, '', { format: 'table', table: { caption: 'Institutions', rows: [{ logicalId: logical(base + 42), cells: [{ logicalId: logical(base + 43), text: 'Public body', header: true }, { logicalId: logical(base + 44), text: 'Accountability' }] }] } }));
    if (number === 20) content.push(text(9999, 'A constitution-wide source note.', { format: 'footnote', footnoteLabel: '*', marks: [{ type: 'italic', start: 0, end: 1 }] }));
    return { id: occurrence(base), logicalId: logical(base), revisionId: id(current ? '054' : '055', base), versionId, articleNumber: String(number), kind: 'article', title: number === 1 ? 'Equal standing' : number === 20 ? 'Accountable institutions' : 'Public institutions', sortOrder: number, content };
  });
}
