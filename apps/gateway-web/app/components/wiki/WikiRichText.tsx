import { Fragment, type ReactNode } from "react";
import {
  wikiCitationIndex,
  wikiTextColors,
  type WikiCitation,
  type WikiNode,
} from "../../../lib/wiki-document";
import { WikiInlineCitation } from "./WikiInlineCitation";

export function WikiRichText({
  document,
  citations,
}: {
  document: WikiNode;
  citations: WikiCitation[];
}) {
  const { numbers } = wikiCitationIndex(document);
  function inline(node: WikiNode, key: string): ReactNode {
    if (node.type === "citation" && node.attrs?.reference) {
      const ref = node.attrs.reference,
        title =
          citations.find(
            (item) =>
              item.documentId === ref.documentId &&
              item.revision === ref.revision,
          )?.title ?? ref.documentId;
      return (
        <WikiInlineCitation
          key={key}
          reference={ref}
          number={numbers[ref.id]}
          title={title}
        />
      );
    }
    const text = (node.marks ?? []).reduce<ReactNode>((value, mark) => {
      if (mark.type === "strong") return <strong>{value}</strong>;
      if (mark.type === "em") return <em>{value}</em>;
      if (mark.type === "underline") return <u>{value}</u>;
      if (
        mark.type === "text_color" &&
        wikiTextColors.some((color) => color.value === mark.attrs?.color)
      )
        return <span style={{ color: mark.attrs?.color }}>{value}</span>;
      return value;
    }, node.text ?? "");
    return <Fragment key={key}>{text}</Fragment>;
  }
  function render(node: WikiNode, key: string): ReactNode {
    if (node.type === "text" || node.type === "citation")
      return inline(node, key);
    const children = node.content?.map((child, index) =>
      render(child, `${key}-${index}`),
    );
    if (node.type === "heading") {
      if (node.attrs?.level === 3) return <h5 key={key}>{children}</h5>;
      if (node.attrs?.level === 2) return <h4 key={key}>{children}</h4>;
      return <h3 key={key}>{children}</h3>;
    }
    const tag = {
      paragraph: "p",
      bullet_list: "ul",
      ordered_list: "ol",
      list_item: "li",
      blockquote: "blockquote",
    }[node.type] as "p" | "ul" | "ol" | "li" | "blockquote" | undefined;
    if (tag === "ol")
      return (
        <ol key={key} start={node.attrs?.order ?? 1}>
          {children}
        </ol>
      );
    if (tag) {
      const Element = tag;
      return <Element key={key}>{children}</Element>;
    }
    if (node.type === "hard_break") return <br key={key} />;
    return <Fragment key={key}>{children}</Fragment>;
  }
  return <div className="wiki-body">{render(document, "wiki")}</div>;
}
