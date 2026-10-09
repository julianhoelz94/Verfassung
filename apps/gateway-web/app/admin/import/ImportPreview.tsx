type Row = Record<string, unknown>;

function row(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
function label(value: unknown): string { return typeof value === 'string' ? value : ''; }
function children(value: unknown): Row[] { return Array.isArray(value) ? value.map(row) : []; }

function PreviewNode({ node, depth = 0 }: { node: Row; depth?: number }) {
  if (depth > 8) return <p>Further nested content is available in the source JSON.</p>;
  const nested = children(node.children).length ? children(node.children) : children(node.nodes);
  const content = children(node.content);
  const text = [label(node.body), ...content.filter(item => item.type === 'text').map(item => label(item.text))].join('');
  return <li>
    <article style={{ borderLeft: '2px solid var(--border, #999)', margin: '0.5rem 0', paddingLeft: '1rem' }}>
      <small>{label(node.kind) || 'article'}</small>
      <h3>{label(node.label) || label(node.articleNumber)} {label(node.title)}</h3>
      {text ? <p style={{ whiteSpace: 'pre-wrap' }}>{text.slice(0, 600)}{text.length > 600 ? '…' : ''}</p> : null}
    </article>
    {nested.length ? <ol>{nested.slice(0, 100).map((child, index) => <PreviewNode key={index} node={child} depth={depth + 1} />)}</ol> : null}
  </li>;
}

export function ImportPreview({ payload }: { payload: Row }) {
  const outline = children(row(payload.outline).kinds);
  const roots = children(payload.roots).length ? children(payload.roots) : children(payload.articles);
  return <>
    <h2>Structure preview</h2>
    <p>{label(payload.countryName)} · {label(payload.constitutionTitle)} · {label(payload.versionLabel)}</p>
    {outline.length ? <table><thead><tr><th>Kind</th><th>Display</th><th>Presentation</th></tr></thead><tbody>{outline.map((kind, index) => <tr key={index}>
      <td>{label(kind.kindCode)}</td><td>{label(kind.displayLabel)}</td><td>{label(kind.presentation)}</td>
    </tr>)}</tbody></table> : <p>Uses the constitution’s existing outline. Confirm it before preparing the draft.</p>}
    <ol>{roots.slice(0, 100).map((root, index) => <PreviewNode key={index} node={root} />)}</ol>
    {roots.length > 100 ? <p>Showing the first 100 top-level units of {roots.length}.</p> : null}
  </>;
}
