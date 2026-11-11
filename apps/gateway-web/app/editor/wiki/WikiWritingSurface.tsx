"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EditorState,
  TextSelection,
  type SelectionBookmark,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import {
  baseKeymap,
  setBlockType,
  toggleMark,
  wrapIn,
  lift,
} from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import {
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { HelpTooltip } from "../../components/HelpTooltip";
import type { WikiCitation } from "../../../lib/wiki-document";
import { wikiSchema as schema } from "../../../lib/wiki-editor-schema";
import { WikiCitationComposer as CitationComposer } from "./WikiCitationComposer";
import {
  wikiCitationIndex as citationIndex,
  legacyWikiDocument as legacyDocument,
  wikiPlainBody as plainBody,
  wikiTextColors as textColors,
  type WikiInlineReference as InlineCitation,
  type WikiWritingValue as WritingValue,
} from "../../../lib/wiki-document";

function ToolIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    undo: "M3 9h9a7 7 0 0 1 0 14 M3 9l5-5 M3 9l5 5",
    redo: "M21 9h-9a7 7 0 0 0 0 14 M21 9l-5-5 M21 9l-5 5",
    bullet: "M9 6h12 M9 12h12 M9 18h12 M3 6h.01 M3 12h.01 M3 18h.01",
    number: "M10 6h11 M10 12h11 M10 18h11 M3 4h1v5 M3 9h3 M3 14h3l-3 5h3",
    cite: "M5 7h5v6H5v-2l3-4 M14 7h5v6h-5v-2l3-4",
    chevron: "m7 10 5 5 5-5",
    help: "M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  };
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind] || paths.help} />
    </svg>
  );
}
export function WikiWritingSurface({
  value,
  onChange,
  locale,
  citations,
  canCreate,
  disabled = false,
  active = true,
  onPendingChange,
  onCitationAdded,
}: {
  value: WritingValue;
  onChange: (value: WritingValue) => void;
  locale: "en" | "de";
  citations: WikiCitation[];
  canCreate: boolean;
  disabled?: boolean;
  active?: boolean;
  onPendingChange: (pending: boolean) => void;
  onCitationAdded: (link: WikiCitation, editingId?: string) => boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    latest = useRef({ onChange, locale, disabled, citations });
  latest.current = { onChange, locale, disabled, citations };
  const bookmark = useRef<SelectionBookmark | null>(null),
    colorBox = useRef<HTMLDivElement>(null),
    paletteRef = useRef<HTMLDivElement>(null),
    [colorOpen, setColorOpen] = useState(false),
    [citeOpen, setCiteOpen] = useState(false),
    [editing, setEditing] = useState<InlineCitation | null>(null),
    [editingPos, setEditingPos] = useState<number | null>(null);
  const [tools, setTools] = useState({
    undo: false,
    redo: false,
    style: "paragraph",
    bold: false,
    italic: false,
    underline: false,
    list: "",
    color: textColors[0].value,
  });
  const copy = (en: string, de: string) => (locale === "en" ? en : de);
  function refresh(editor: EditorView) {
    const state = editor.state,
      { from, $from, to, empty } = state.selection,
      marks = state.storedMarks || $from.marks();
    let list = "",
      quoted = false;
    for (let depth = $from.depth; depth > 0; depth--) {
      const type = $from.node(depth).type.name;
      if (type === "bullet_list" || type === "ordered_list") list = type;
      if (type === "blockquote") quoted = true;
    }
    const active = (type: string) =>
      empty
        ? marks.some((mark) => mark.type.name === type)
        : state.doc.rangeHasMark(from, to, schema.marks[type]);
    setTools({
      undo: undo(state),
      redo: redo(state),
      style: quoted
        ? "blockquote"
        : $from.parent.type.name === "heading"
          ? `heading-${$from.parent.attrs.level}`
          : "paragraph",
      bold: active("strong"),
      italic: active("em"),
      underline: active("underline"),
      list,
      color:
        marks.find((mark) => mark.type.name === "text_color")?.attrs.color ||
        textColors[0].value,
    });
    const { numbers, references } = citationIndex(state.doc.toJSON());
    editor.dom
      .querySelectorAll<HTMLElement>("[data-citation-id]")
      .forEach((element) => {
        const reference = references.find(
          (item) => item.id === element.dataset.citationId,
        );
        if (!reference) return;
        const number = numbers[reference.id];
        element.textContent = `[${number}]`;
        element.setAttribute(
          "aria-label",
          `${latest.current.locale === "en" ? "Citation" : "Beleg"} ${number}: ${latest.current.citations.find((item) => item.documentId === reference.documentId && item.revision === reference.revision)?.title || reference.documentId}${reference.locator ? ` · ${reference.locator}` : ""}`,
        );
      });
  }
  function openCitation(
    reference: InlineCitation | null = null,
    pos: number | null = null,
  ) {
    const editor = view.current;
    if (!editor) return;
    bookmark.current = editor.state.selection.getBookmark();
    setEditing(reference);
    setEditingPos(pos);
    setCiteOpen(true);
    setColorOpen(false);
  }
  const openLatest = useRef(openCitation);
  openLatest.current = openCitation;
  useEffect(() => {
    if (!host.current) return;
    const plugins = [
      history(),
      keymap({
        "Mod-End": (state, dispatch) => {
          dispatch?.(
            state.tr
              .setSelection(TextSelection.atEnd(state.doc))
              .scrollIntoView(),
          );
          return true;
        },
        "Mod-Home": (state, dispatch) => {
          dispatch?.(
            state.tr
              .setSelection(TextSelection.atStart(state.doc))
              .scrollIntoView(),
          );
          return true;
        },
        "Mod-z": undo,
        "Mod-Shift-z": redo,
        "Mod-y": redo,
        "Mod-b": toggleMark(schema.marks.strong),
        "Mod-i": toggleMark(schema.marks.em),
        "Mod-u": toggleMark(schema.marks.underline),
        Enter: splitListItem(schema.nodes.list_item),
        Tab: sinkListItem(schema.nodes.list_item),
        "Shift-Tab": liftListItem(schema.nodes.list_item),
      }),
      keymap(baseKeymap),
    ];
    const editor = new EditorView(host.current, {
      state: EditorState.create({
        schema,
        doc: schema.nodeFromJSON(
          value.bodyDocument || legacyDocument(value.body),
        ),
        plugins,
      }),
      editable: () => !latest.current.disabled,
      attributes: {
        id: "wiki-body",
        class: "writing-document",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": copy("Page text", "Seitentext"),
        spellcheck: "true",
      },
      nodeViews: {
        citation(node) {
          const dom = document.createElement("sup");
          dom.className = "editor-citation";
          dom.contentEditable = "false";
          dom.setAttribute("role", "button");
          dom.tabIndex = 0;
          dom.dataset.citationId = node.attrs.reference.id;
          return {
            dom,
            ignoreMutation: () => true,
            update(next) {
              if (next.type.name !== "citation") return false;
              dom.dataset.citationId = next.attrs.reference.id;
              return true;
            },
          };
        },
      },
      dispatchTransaction(transaction) {
        const next = editor.state.apply(transaction);
        editor.updateState(next);
        if (editor.hasFocus()) bookmark.current = next.selection.getBookmark();
        if (transaction.docChanged) {
          const bodyDocument = next.doc.toJSON();
          latest.current.onChange({
            body: plainBody(bodyDocument),
            bodyDocument,
          });
        }
        refresh(editor);
      },
      handleClickOn(_view, _pos, node, nodePos, event, direct) {
        if (node.type.name === "citation" && direct) {
          event.preventDefault();
          openLatest.current(node.attrs.reference, nodePos);
          return true;
        }
        return false;
      },
      handleKeyDown(editor, event) {
        const target = event.target as HTMLElement;
        if (
          target.closest?.("[data-citation-id]") &&
          (event.key === "Enter" || event.key === " ")
        ) {
          const id =
            target.closest<HTMLElement>("[data-citation-id]")!.dataset
              .citationId;
          let found = false;
          editor.state.doc.descendants((node, pos) => {
            if (
              node.type.name === "citation" &&
              node.attrs.reference.id === id
            ) {
              openLatest.current(node.attrs.reference, pos);
              found = true;
            }
            return !found;
          });
          return found;
        }
        return false;
      },
    });
    view.current = editor;
    refresh(editor);
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The document is owned by EditorView; task changes and saves must not recreate its history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor) {
      editor.dom.setAttribute(
        "aria-label",
        locale === "en" ? "Page text" : "Seitentext",
      );
      refresh(editor);
    }
  }, [locale, citations]);
  useEffect(() => {
    view.current?.setProps({ editable: () => !disabled });
  }, [disabled]);
  useEffect(() => {
    if (!active) setColorOpen(false);
  }, [active]);
  useEffect(() => {
    const palette = paletteRef.current;
    if (!colorOpen) {
      if (palette?.matches(":popover-open")) palette.hidePopover();
      return;
    }
    if (palette && colorBox.current) {
      const rect = colorBox.current.getBoundingClientRect(),
        width = matchMedia("(pointer:coarse)").matches ? 282 : 224;
      Object.assign(palette.style, {
        position: "fixed",
        left: `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`,
        top: `${Math.min(rect.bottom + 8, innerHeight - 150)}px`,
        right: "auto",
        bottom: "auto",
        margin: "0",
      });
      if (!palette.matches(":popover-open")) palette.showPopover();
    }
    const close = (event: PointerEvent) => {
      if (!colorBox.current?.contains(event.target as Node))
        setColorOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [colorOpen]);
  function remember() {
    if (view.current)
      bookmark.current = view.current.state.selection.getBookmark();
  }
  function restore() {
    const editor = view.current;
    if (!editor) return null;
    if (bookmark.current) {
      try {
        editor.dispatch(
          editor.state.tr.setSelection(
            bookmark.current.resolve(editor.state.doc),
          ),
        );
      } catch {
        editor.dispatch(
          editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)),
        );
      }
    }
    editor.focus();
    return editor;
  }
  function command(
    run: (
      state: EditorState,
      dispatch?: EditorView["dispatch"],
      view?: EditorView,
    ) => boolean,
    restoreSelection = false,
  ) {
    const editor = restoreSelection ? restore() : view.current;
    if (!editor) return;
    editor.focus();
    run(
      editor.state,
      run === undo || run === redo
        ? editor.dispatch
        : (transaction) => {
            editor.dispatch(closeHistory(transaction));
            editor.dispatch(closeHistory(editor.state.tr));
          },
      editor,
    );
    refresh(editor);
  }
  function style(value: string) {
    const editor = restore();
    if (!editor) return;
    editor.dispatch(closeHistory(editor.state.tr));
    if (tools.list && value !== "paragraph")
      liftListItem(schema.nodes.list_item)(editor.state, editor.dispatch);
    if (value === "blockquote") {
      wrapIn(schema.nodes.blockquote)(editor.state, editor.dispatch);
      editor.dispatch(closeHistory(editor.state.tr));
      return;
    }
    if (tools.style === "blockquote") lift(editor.state, editor.dispatch);
    setBlockType(
      value.startsWith("heading")
        ? schema.nodes.heading
        : schema.nodes.paragraph,
      value.startsWith("heading") ? { level: Number(value.split("-")[1]) } : {},
    )(editor.state, editor.dispatch);
    editor.dispatch(closeHistory(editor.state.tr));
  }
  function list(type: "bullet_list" | "ordered_list") {
    const editor = view.current;
    if (!editor) return;
    editor.focus();
    editor.dispatch(closeHistory(editor.state.tr));
    if (tools.list === type)
      liftListItem(schema.nodes.list_item)(editor.state, editor.dispatch);
    else if (tools.list) {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--)
        if (
          ["bullet_list", "ordered_list"].includes($from.node(depth).type.name)
        ) {
          editor.dispatch(
            editor.state.tr.setNodeMarkup(
              $from.before(depth),
              schema.nodes[type],
              type === "ordered_list" ? { order: 1 } : {},
            ),
          );
          break;
        }
    } else wrapInList(schema.nodes[type])(editor.state, editor.dispatch);
    editor.dispatch(closeHistory(editor.state.tr));
  }
  function color(value: string) {
    const editor = restore();
    if (!editor) return;
    const { from, to, empty } = editor.state.selection,
      tr = editor.state.tr;
    if (empty) {
      if (value === textColors[0].value)
        tr.removeStoredMark(schema.marks.text_color);
      else tr.addStoredMark(schema.marks.text_color.create({ color: value }));
    } else {
      tr.removeMark(from, to, schema.marks.text_color);
      if (value !== textColors[0].value)
        tr.addMark(from, to, schema.marks.text_color.create({ color: value }));
    }
    editor.dispatch(closeHistory(tr));
    editor.dispatch(closeHistory(editor.state.tr));
    setColorOpen(false);
    editor.focus();
  }
  function closeCitation() {
    setCiteOpen(false);
    setTimeout(() => restore(), 0);
  }
  function confirmCitation(link: WikiCitation, locator: string) {
    const editor = view.current;
    if (!editor || !onCitationAdded(link, editing?.id)) return false;
    restore();
    const reference = {
      documentId: link.documentId,
      revision: link.revision,
      id: editing?.id || crypto.randomUUID(),
      locator,
    };
    if (editing && editingPos !== null)
      editor.dispatch(
        closeHistory(
          editor.state.tr
            .setNodeMarkup(editingPos, undefined, { reference })
            .scrollIntoView(),
        ),
      );
    else
      editor.dispatch(
        closeHistory(
          editor.state.tr
            .replaceSelectionWith(
              schema.nodes.citation.create({ reference }),
              false,
            )
            .scrollIntoView(),
        ),
      );
    editor.dispatch(closeHistory(editor.state.tr));
    bookmark.current = editor.state.selection.getBookmark();
    setCiteOpen(false);
    setTimeout(() => editor.focus(), 0);
    return true;
  }
  const button = (
    name: string,
    content: ReactNode,
    action: () => void,
    active?: boolean,
    buttonDisabled = false,
    title?: string,
  ) => (
    <button
      type="button"
      title={title || name}
      aria-label={name}
      aria-pressed={active}
      disabled={buttonDisabled || disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {content}
    </button>
  );
  return (
    <div className="writing-surface rich-writing-surface">
      <div
        className="format-bar versatile-toolbar"
        aria-disabled={disabled}
        role="toolbar"
        aria-label={copy("Text formatting", "Textformatierung")}
      >
        <div
          className="toolbar-group"
          role="group"
          aria-label={copy("Editing history", "Bearbeitungsverlauf")}
        >
          {button(
            copy("Undo", "Rückgängig"),
            <ToolIcon kind="undo" />,
            () => command(undo),
            undefined,
            !tools.undo,
            copy("Undo · Ctrl/⌘ Z", "Rückgängig · Strg/⌘ Z"),
          )}
          {button(
            copy("Redo", "Wiederholen"),
            <ToolIcon kind="redo" />,
            () => command(redo),
            undefined,
            !tools.redo,
            copy("Redo · Ctrl/⌘ Shift Z", "Wiederholen · Strg/⌘ Umschalt Z"),
          )}
        </div>
        <span className="format-divider" />
        <label className="style-menu">
          <span className="visually-hidden">
            {copy("Text style", "Textstil")}
          </span>
          <select
            aria-label={copy("Text style", "Textstil")}
            disabled={disabled}
            value={tools.style}
            onPointerDown={remember}
            onKeyDown={remember}
            onChange={(event) => style(event.target.value)}
          >
            <option value="paragraph">{copy("Paragraph", "Absatz")}</option>
            <option value="heading-1">
              {copy("Heading 1", "Überschrift 1")}
            </option>
            <option value="heading-2">
              {copy("Heading 2", "Überschrift 2")}
            </option>
            <option value="heading-3">
              {copy("Heading 3", "Überschrift 3")}
            </option>
            <option value="blockquote">{copy("Quote", "Zitat")}</option>
          </select>
        </label>
        <span className="format-divider" />
        <div
          className="toolbar-group"
          role="group"
          aria-label={copy("Inline formatting", "Zeichenformatierung")}
        >
          {button(
            copy("Bold", "Fett"),
            <b>B</b>,
            () => command(toggleMark(schema.marks.strong)),
            tools.bold,
          )}
          {button(
            copy("Italic", "Kursiv"),
            <i>I</i>,
            () => command(toggleMark(schema.marks.em)),
            tools.italic,
          )}
          {button(
            copy("Underline", "Unterstrichen"),
            <u>U</u>,
            () => command(toggleMark(schema.marks.underline)),
            tools.underline,
          )}
        </div>
        <div
          className="toolbar-group"
          role="group"
          aria-label={copy("Lists", "Listen")}
        >
          {button(
            copy("Bulleted list", "Aufzählung"),
            <ToolIcon kind="bullet" />,
            () => list("bullet_list"),
            tools.list === "bullet_list",
          )}
          {button(
            copy("Numbered list", "Nummerierte Liste"),
            <ToolIcon kind="number" />,
            () => list("ordered_list"),
            tools.list === "ordered_list",
          )}
        </div>
        <div ref={colorBox} className="text-color-control">
          <button
            type="button"
            className="color-trigger"
            disabled={disabled}
            title={copy("Text color", "Textfarbe")}
            aria-label={copy("Text color", "Textfarbe")}
            aria-expanded={colorOpen}
            aria-controls="text-color-palette"
            onMouseDown={(event) => {
              event.preventDefault();
              remember();
            }}
            onClick={() => setColorOpen(!colorOpen)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setColorOpen(false);
                event.stopPropagation();
              }
            }}
          >
            <span style={{ borderBottomColor: tools.color }}>A</span>
            <ToolIcon kind="chevron" />
          </button>
          <div
            ref={paletteRef}
            popover="manual"
            id="text-color-palette"
            className="color-palette"
            hidden={!colorOpen}
            role="group"
            aria-label={copy("Text colors", "Textfarben")}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setColorOpen(false);
                restore();
                event.stopPropagation();
              }
            }}
          >
            <span>{copy("Text color", "Textfarbe")}</span>
            <div>
              {textColors.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-label={item.name[locale]}
                  aria-pressed={tools.color === item.value}
                  title={item.name[locale]}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => color(item.value)}
                >
                  <span style={{ background: item.value }}>
                    {tools.color === item.value ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <small>
              {copy(
                "Select text to change its color.",
                "Wähle Text aus, um seine Farbe zu ändern.",
              )}
            </small>
          </div>
        </div>
        <span className="format-divider" />
        <button
          type="button"
          className="cite-source-tool"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openCitation()}
        >
          <ToolIcon kind="cite" />
          <span>{copy("Cite source", "Quelle zitieren")}</span>
        </button>
        <div className="format-help">
          <HelpTooltip
            label={copy(
              "Format selected text, add a numbered source reference, or undo and redo your edits. Citations keep their document revision and page or passage.",
              "Formatiere ausgewählten Text, ergänze nummerierte Belege oder mache Änderungen rückgängig und wiederhole sie. Belege behalten Dokumentrevision und Seite oder Passage.",
            )}
          >
            <ToolIcon kind="help" />
          </HelpTooltip>
        </div>
      </div>
      <div ref={host} className="prosemirror-host" />
      <CitationComposer
        open={citeOpen}
        editing={editing}
        citations={citations}
        canCreate={canCreate}
        onPendingChange={onPendingChange}
        copy={copy}
        onConfirm={confirmCitation}
        onClose={closeCitation}
        onRemove={() => {
          const editor = view.current;
          if (editor && editingPos !== null) {
            editor.dispatch(
              closeHistory(
                editor.state.tr
                  .delete(editingPos, editingPos + 1)
                  .scrollIntoView(),
              ),
            );
            editor.dispatch(closeHistory(editor.state.tr));
            bookmark.current = editor.state.selection.getBookmark();
            closeCitation();
          }
        }}
      />
    </div>
  );
}
