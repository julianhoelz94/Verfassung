import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import type { ContentOutline, OrderedEntry, OrderedNode, OrderedTable, OrderedInlineReference } from '../../../lib/api';
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
    mayHoldText: true, mayHoldChildren: true,
    root: typeof kind.root === 'boolean' ? kind.root : index === 0,
    allowedChildKinds: Array.isArray(kind.allowedChildKinds) ? kind.allowedChildKinds.map(string) : kinds.slice(index + 1, index + 2).map(child => string(child.kindCode)),
    presentation: string(kind.presentation) || 'section', showLabel: kind.showLabel !== false,
    showTitle: kind.showTitle === true, showKind: kind.showKind === true,
    allowTextAlongsideChildren: kind.allowTextAlongsideChildren === true,
    titlePolicy: string(kind.titlePolicy) || 'optional', labelPolicy: string(kind.labelPolicy) || 'optional',
    labelPlacement: string(kind.labelPlacement) || 'before_title', segmentation: string(kind.segmentation) || 'plain',
  })) };
}

export function previewNode(source: Row, path: string): OrderedNode {
  const content = children(source.content);
  const entries: OrderedEntry[] = content.length ? content.map((part, index) => part.type === 'child' && part.node
    ? { type: 'child', node: previewNode(row(part.node), `${path}-${index}`) }
    : {
      type: 'text', text: string(part.text), logicalId: string(part.logicalId) || `${path}-entry-${index}`, occurrenceId: string(part.occurrenceId) || string(part.logicalId) || `${path}-entry-${index}`,
      format: part.format as OrderedEntry['format'], table: part.table as OrderedTable | undefined,
      footnoteLabel: part.footnoteLabel as string | undefined, references: part.references as OrderedInlineReference[] | undefined, annotation: part.annotation as OrderedEntry['annotation'],
    }) : [
      ...(string(source.body) ? [{ type: 'text' as const, text: string(source.body) }] : []),
      ...children(source.children).concat(children(source.nodes)).map((child, index) => ({ type: 'child' as const, node: previewNode(child, `${path}-${index}`) })),
    ];
  return {
    logicalId: string(source.logicalId) || path, revisionId: string(source.revisionId) || path, occurrenceId: string(source.occurrenceId) || path,
    kind: string(source.kind) || 'article', label: string(source.label) || string(source.articleNumber),
    title: string(source.title), content: entries,
  };
}

export function previewRoots(roots: unknown): OrderedNode[] {
  return children(roots).slice(0, 100).map((root, index) => previewNode(root, `import-preview-${index}`));
}

export function ImportPreview({ payload, outline: confirmedOutline }: { payload: Row; outline?: ContentOutline | null }) {
  const roots = children(payload.roots).length ? children(payload.roots) : children(payload.articles);
  const outline = confirmedOutline ?? previewOutline(payload);
  return <>
    <h2><T value={ui.admin.import.importpreview.proposedStructureAndSample} /></h2>
    <p>{string(payload.countryName)} · {string(payload.constitutionTitle)} · {string(payload.versionLabel)}</p>
    {outline ? <table><thead><tr><th><T value={ui.admin.import.importpreview.kind} /></th><th><T value={ui.admin.import.importpreview.display} /></th><th><T value={ui.admin.import.importpreview.presentation} /></th></tr></thead><tbody>{outline.kinds.map(kind => <tr key={kind.kindCode}>
      <td>{kind.kindCode}</td><td>{kind.displayLabel}</td><td>{kind.presentation}</td>
    </tr>)}</tbody></table> : <p><T value={ui.admin.import.importpreview.usesTheConstitutionsExistingLayoutRevision} />{" "}{string(payload.settingsRevisionId)}.</p>}
    <OrderedContentTree entries={previewRoots(roots).map(node => ({ type: 'child', node }))} outline={outline} />
    {roots.length > 100 ? <p><T value={ui.admin.import.importpreview.showingTheFirst100TopLevelUnits} />{" "}{roots.length}.</p> : null}
  </>;
}
