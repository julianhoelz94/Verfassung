import type { ContentOutline, OrderedEntry, OrderedNode } from '../../../lib/api';
import { OrderedContentTree } from '../../components/ConstitutionText';

type Row = Record<string, unknown>;

function row(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
function children(value: unknown): Row[] { return Array.isArray(value) ? value.map(row) : []; }

function previewOutline(payload: Row): ContentOutline | undefined {
  const kinds = children(row(payload.outline).kinds);
  if (!kinds.length) return undefined;
  return { kinds: kinds.map((kind, index) => ({
    kindCode: string(kind.kindCode), displayLabel: string(kind.displayLabel), sortOrder: index + 1,
    mayHoldText: true, mayHoldChildren: true, allowedChildKinds: kinds.slice(index + 1).map(child => string(child.kindCode)),
    presentation: string(kind.presentation) || 'section', showLabel: kind.showLabel !== false,
    showTitle: kind.showTitle === true, showKind: kind.showKind === true,
    allowTextAlongsideChildren: kind.allowTextAlongsideChildren === true,
    titlePolicy: string(kind.titlePolicy) || 'optional', labelPolicy: string(kind.labelPolicy) || 'optional',
    labelPlacement: string(kind.labelPlacement) || 'before_title', segmentation: string(kind.segmentation) || 'plain',
  })) };
}

function previewNode(source: Row, path: string, depth = 0): OrderedNode {
  const content = depth < 12 ? children(source.content) : [];
  const entries: OrderedEntry[] = content.length ? content.map((part, index) => part.type === 'child' && part.node
    ? { type: 'child', node: previewNode(row(part.node), `${path}-${index}`, depth + 1) }
    : { type: 'text', text: string(part.text) }) : [
      ...(string(source.body) ? [{ type: 'text' as const, text: string(source.body) }] : []),
      ...(depth < 12 ? children(source.children).concat(children(source.nodes)).slice(0, 100).map((child, index) => ({ type: 'child' as const, node: previewNode(child, `${path}-${index}`, depth + 1) })) : []),
    ];
  return {
    logicalId: string(source.logicalId) || path, revisionId: path, occurrenceId: path,
    kind: string(source.kind) || 'article', label: string(source.label) || string(source.articleNumber),
    title: string(source.title), content: entries,
  };
}

export function ImportPreview({ payload }: { payload: Row }) {
  const roots = children(payload.roots).length ? children(payload.roots) : children(payload.articles);
  const outline = previewOutline(payload);
  return <>
    <h2>Proposed structure and sample</h2>
    <p>{string(payload.countryName)} · {string(payload.constitutionTitle)} · {string(payload.versionLabel)}</p>
    {outline ? <table><thead><tr><th>Kind</th><th>Display</th><th>Presentation</th></tr></thead><tbody>{outline.kinds.map(kind => <tr key={kind.kindCode}>
      <td>{kind.kindCode}</td><td>{kind.displayLabel}</td><td>{kind.presentation}</td>
    </tr>)}</tbody></table> : <p>Uses the constitution’s existing layout revision {string(payload.settingsRevisionId)}.</p>}
    <OrderedContentTree entries={roots.slice(0, 100).map((root, index) => ({ type: 'child', node: previewNode(root, `import-preview-${index}`) }))} outline={outline} />
    {roots.length > 100 ? <p>Showing the first 100 top-level units of {roots.length}.</p> : null}
  </>;
}
