import { Schema } from "prosemirror-model";
import {
  readWikiDocument,
  wikiTextColors as textColors,
} from "./wiki-document";

function readColor(value: unknown) {
  const probe = document.createElement("span");
  probe.style.color = String(value);
  const normalized = probe.style.color;
  const matched = textColors.find((item) => {
    probe.style.color = item.value;
    return probe.style.color === normalized;
  });
  return matched ? { color: matched.value } : false;
}

export const wikiSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    heading: {
      group: "block",
      content: "inline*",
      defining: true,
      attrs: { level: { default: 1 } },
      parseDOM: [
        { tag: "h3", attrs: { level: 1 } },
        { tag: "h4", attrs: { level: 2 } },
        { tag: "h5", attrs: { level: 3 } },
      ],
      toDOM: (node) => [`h${Number(node.attrs.level) + 2}`, 0],
    },
    blockquote: {
      group: "block",
      content: "block+",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    },
    bullet_list: {
      group: "block",
      content: "list_item+",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    },
    ordered_list: {
      group: "block",
      content: "list_item+",
      attrs: { order: { default: 1 } },
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom) => {
            const order = Number(
              (dom as HTMLElement).getAttribute("start") || 1,
            );
            return {
              order:
                Number.isSafeInteger(order) && order > 0 && order <= 100000
                  ? order
                  : 1,
            };
          },
        },
      ],
      toDOM: (node) => ["ol", { start: node.attrs.order }, 0],
    },
    list_item: {
      content: "paragraph block*",
      defining: true,
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0],
    },
    text: { group: "inline" },
    hard_break: {
      marks: "",
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
    citation: {
      inline: true,
      group: "inline",
      atom: true,
      selectable: true,
      marks: "",
      attrs: { reference: {} },
      parseDOM: [
        {
          tag: "sup[data-wiki-citation]",
          getAttrs: (dom) => {
            try {
              const raw = JSON.parse(
                (dom as HTMLElement).getAttribute("data-wiki-citation") ||
                  "null",
              );
              const document = readWikiDocument({
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "citation",
                        attrs: {
                          reference: { ...raw, id: crypto.randomUUID() },
                        },
                      },
                    ],
                  },
                ],
              });
              return document?.content?.[0].content?.[0].attrs ?? false;
            } catch {
              return false;
            }
          },
        },
      ],
      toDOM: (node) => [
        "sup",
        {
          "data-citation-id": node.attrs.reference.id,
          "data-wiki-citation": JSON.stringify(node.attrs.reference),
          class: "editor-citation",
          contenteditable: "false",
          role: "button",
          tabindex: "0",
        },
        "•",
      ],
    },
  },
  marks: {
    strong: {
      parseDOM: [
        { tag: "strong" },
        {
          tag: "b",
          getAttrs: (node) =>
            (node as HTMLElement).style.fontWeight !== "normal" && null,
        },
        { style: "font-weight=bold" },
        {
          style: "font-weight",
          getAttrs: (weight) =>
            /^(bold(er)?|[5-9]\d{2,})$/.test(String(weight)) && null,
        },
      ],
      toDOM: () => ["strong", 0],
    },
    em: {
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      toDOM: () => ["em", 0],
    },
    underline: {
      parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
      toDOM: () => ["u", 0],
    },
    text_color: {
      attrs: { color: {} },
      parseDOM: [{ style: "color", getAttrs: readColor }],
      toDOM: (mark) => [
        "span",
        {
          style: `color:${textColors.some((item) => item.value === mark.attrs.color) ? mark.attrs.color : "#25332f"}`,
        },
        0,
      ],
    },
  },
});
