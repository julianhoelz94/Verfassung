import { createElement, type ReactNode } from "react";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import styles from "./ImportReviewWorkspace.module.css";

const allowed = new Set([
  "article",
  "section",
  "div",
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sup",
  "sub",
  "small",
  "br",
  "hr",
  "pre",
  "blockquote",
  "ol",
  "ul",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "a",
  "dl",
  "dt",
  "dd",
]);
const blocked = new Set([
  "script",
  "style",
  "template",
  "form",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "head",
  "noscript",
  "svg",
  "math",
]);
type Node = DefaultTreeAdapterMap["childNode"];

/** Parse archival markup as data; render only semantic elements and explicitly allowed attributes. */
export function ArchivedImportSource({
  html,
  sourceUrl,
}: {
  html: string;
  sourceUrl: string;
}) {
  const fragment = parseFragment(html);
  const queue: Node[] = [...fragment.childNodes];
  let firstLevel = 6;
  while (queue.length) {
    const node = queue.pop()!;
    if (!('tagName' in node) || blocked.has(node.tagName)) continue;
    if (/^h[1-6]$/.test(node.tagName)) firstLevel = Math.min(firstLevel, Number(node.tagName[1]));
    queue.push(...node.childNodes);
  }
  function render(node: Node, path: string, depth = 0): ReactNode {
    if (node.nodeName === "#text")
      return (node as DefaultTreeAdapterMap["textNode"]).value;
    if (!("tagName" in node) || blocked.has(node.tagName)) return null;
    if (depth >= 64) return sourceText(node);
    const children = node.childNodes.map((child, index) =>
      render(child, `${path}-${index}`, depth + 1),
    );
    if (!allowed.has(node.tagName)) return children;
    const attrs: Record<string, string | number> = {};
    for (const { name, value } of node.attrs) {
      if (name === "id") attrs.id = `archived-source-${value}`;
      if (name === "lang") attrs.lang = value;
      if (name === "dir" && ["ltr", "rtl", "auto"].includes(value))
        attrs.dir = value;
      if (["colspan", "rowspan"].includes(name) && /^\d{1,3}$/.test(value))
        attrs[name === "colspan" ? "colSpan" : "rowSpan"] = Math.max(
          1,
          Number(value),
        );
      if (name === "href" && node.tagName === "a") {
        if (value.startsWith("#"))
          attrs.href = `#archived-source-${value.slice(1)}`;
        else
          try {
            const url = new URL(value, sourceUrl);
            if (["http:", "https:"].includes(url.protocol)) {
              attrs.href = url.href;
              attrs.rel = "noreferrer";
              attrs.target = "_blank";
            }
          } catch {
            /* Retain the link wording if its address is invalid. */
          }
      }
    }
    // Embed the source outline below the source panel's heading, retaining relative levels.
    const heading = /^h[1-6]$/.test(node.tagName) ? Number(node.tagName[1]) : null;
    if (heading) return createElement('div', { key: path, ...attrs, role: 'heading', 'aria-level': heading - firstLevel + 3, 'data-source-heading': heading }, ...children);
    return createElement(node.tagName, { key: path, ...attrs }, ...children);
  }
  return (
    <div className={[styles.document, styles.archived].join(" ")}>
      {fragment.childNodes.map((node, index) =>
        render(node, String(index)),
      )}
    </div>
  );
}

/** Very deeply nested legacy markup retains its wording without exhausting the rendering stack. */
function sourceText(root: Node) {
  const queue = [root], text: string[] = [];
  while (queue.length) {
    const node = queue.pop()!;
    if (node.nodeName === '#text') text.push((node as DefaultTreeAdapterMap['textNode']).value);
    else if ('tagName' in node && !blocked.has(node.tagName)) queue.push(...[...node.childNodes].reverse());
  }
  return text.join('');
}
