"use client";

import {
  Bold,
  BookOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  GitCompare,
  Info,
  Italic,
  Link,
  ListTree,
  Pencil,
  Plus,
  Redo2,
  Settings2,
  SlidersHorizontal,
  SquareDashed,
  Strikethrough,
  Superscript,
  TextCursorInput,
  Underline,
  Undo2,
  X,
} from "lucide-react";

import type { ContentOutline, OrderedTextMark } from "../../lib/api";

import {
  readerNode,
  token,
  type DraftEntry,
  type DraftNode,
} from "../../lib/structured-editor";

import {
  normalizeMarks,
  simpleUnit,
  type CanvasUnit,
} from "../../lib/continuous-editor";

import { articleHeading } from "../../lib/outline";

import { ui } from "../../lib/messages";

import { EditorNavigationToggle } from "./EditorWorkspace";

import { ConstitutionDocument } from "../components/ConstitutionDocument";

import {
  ConstitutionArticleHeading,
  ConstitutionFootnotes,
  ConstitutionText,
} from "../components/ConstitutionText";

import { FootnoteProvider } from "../components/Footnotes";

import { footnoteBacklinks } from "../../lib/footnotes";

import { ChangeOverview } from "./ChangeOverview";

import { ContinuousCanvas } from "./ContinuousCanvas";

import { EditorContextMenu, FootnoteMarkerMenu } from "./FootnoteMarkerMenu";

import styles from "./compact-editor.module.css";
import type { StructuredEditorModel } from "./structured-editor-model";

/** Keeps icon-only controls named and prevents mouse-down from discarding the current canvas selection. */
function IconTool({
  name,
  icon: Icon,
  onClick,
  pressed,
  disabled = false,
}: {
  name: string;
  icon: typeof Bold;
  onClick: () => void;
  pressed?: boolean | "mixed";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={name}
      title={name}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}
/** Renders existing workspace state without adding component boundaries or remounting canvases. */
export function renderStructuredEditor(model: StructuredEditorModel) {
  const {
    activate,
    activeCanvas,
    activeLevel,
    activeMarker,
    activeMarks,
    allNodes,
    applyNote,
    articleId,
    beginMarkerMove,
    bodyCanvas,
    boundaries,
    canManageStructure,
    canvasReset,
    change,
    changeIndex,
    changeScope,
    closeNoteEditor,
    constitutionId,
    copy,
    createNode,
    currentRoot,
    detailsPanel,
    documentsPanel,
    differenceReference,
    differences,
    editable,
    eligible,
    errors,
    externalUrl,
    focusedNodes,
    future,
    history,
    insert,
    insertPosition,
    kindName,
    link,
    loadedRootIds,
    loading,
    markerContext,
    markerCount,
    markerMove,
    message,
    mode,
    moveSelected,
    navigateDifference,
    navigateNote,
    navigateRoot,
    newNote,
    normalizeEndnotes,
    noteEdit,
    noteError,
    noteFuture,
    noteHistory,
    noteProblemText,
    noteProblems,
    noteReferences,
    notes,
    onlyUnmarked,
    openNoteEditor,
    operations,
    outline,
    overviewRoots,
    panel,
    placeMarker,
    preview,
    reconcile,
    referenceTarget,
    removeMarker,
    removeNote,
    rootKinds,
    rootRef,
    roots,
    saveAttempted,
    saving,
    scope,
    select,
    selectedEntry,
    selectedUnit,
    selection,
    setActiveCanvas,
    setActiveMarker,
    setActiveMarks,
    setBoundaries,
    setExternalUrl,
    setInsertPosition,
    setMarkerContext,
    setMarkerMove,
    setMessage,
    setMode,
    setOnlyUnmarked,
    setPanel,
    setReferenceTarget,
    setSaveAttempted,
    setTextContext,
    showPreview,
    sourceRoots,
    t,
    textContext,
    toolbarTop,
    travel,
    updateEntry,
    updateNoteDraft,
    versionId,
    visibleNotes,
    wikiPanel,
  } = model;

  /** Preserves canvas keys, controller callbacks and all original mixed-content rendering options. */
  function canvas(
    units: CanvasUnit[],
    parentId: string | null,
    entriesOnly = false,
    showUnitMetadata = true,
  ) {
    const level = outline.kinds.find(
      (level) => level.kindCode === units[0].node.kind,
    )!;
    return (
      <ContinuousCanvas
        active={
          !noteEdit && units.some((unit) => unit.entry.logicalId === selection)
        }
        key={units[0].entry.logicalId}
        units={units}
        resetVersion={canvasReset}
        label={copy("Constitution text", "Verfassungstext")}
        editable={editable && !noteEdit}
        flowing={level.presentation === "concatenated"}
        boundaries={boundaries && level.presentation === "concatenated"}
        automatic={!entriesOnly && eligible(level)}
        delimiters={level.sentenceDelimiters ?? [".", "!", "?"]}
        notes={notes.map((note) => ({
          logicalId: note.entry.logicalId!,
          label: note.entry.footnoteLabel ?? "*",
        }))}
        unitLabels={
          showUnitMetadata && !entriesOnly
            ? Object.fromEntries(
                units.map((unit) => [
                  unit.node.logicalId,
                  [
                    level.showKind ? level.displayLabel : "",
                    level.showLabel ? unit.node.label : "",
                    level.showTitle ? unit.node.title : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                ]),
              )
            : {}
        }
        onSelectUnit={select}
        onActivate={activate}
        onMarkerActivate={setActiveMarker}
        onMarkerContextMenu={(context) => {
          setPanel("");
          setTextContext(null);
          setActiveMarker(context);
          setMarkerContext(context);
        }}
        onTextContextMenu={(context) => {
          setPanel("");
          setMarkerContext(null);
          setTextContext(context);
        }}
        onChange={(blocks, grouping) =>
          reconcile(units, blocks, parentId, grouping, entriesOnly)
        }
        onUndo={() => travel()}
        onRedo={() => travel(true)}
      />
    );
  }

  /** Renders one node without changing section keys, shared heading markup or canvas ownership. */
  function renderNode(node: DraftNode): React.ReactNode {
    const level = outline.kinds.find((level) => level.kindCode === node.kind);
    if (!level) return null;
    const isRoot = roots.some((root) => root.logicalId === node.logicalId);
    const heading = nodeHeading(node, level, isRoot);
    const own = simpleUnit(node);
    if (own)
      return (
        <section key={node.logicalId} data-editor-unit={node.logicalId}>
          {heading}
          {canvas(
            [own],
            allNodes.find((parent) =>
              parent.content.some(
                (entry) => entry.node?.logicalId === node.logicalId,
              ),
            )?.logicalId ?? null,
            false,
            false,
          )}
        </section>
      );
    return (
      <section
        key={node.logicalId}
        data-editor-unit={node.logicalId}
        className={styles.unit}
      >
        {heading}
        {renderNodeEntries(node)}
      </section>
    );
  }
  /** Root headings keep shared legal-document presentation; other units retain contextual metadata. */
  function nodeHeading(
    node: DraftNode,
    level: ContentOutline["kinds"][number],
    isRoot: boolean,
  ): React.ReactNode {
    const article = {
      articleNumber: node.label ?? "",
      title: node.title ?? "",
      kind: node.kind,
    };
    const sharedHeading =
      isRoot &&
      level.labelPlacement !== "inline" &&
      level.labelPlacement !== "superscript"
        ? articleHeading(outline, article)
        : "";
    const contextualHeading = [
      level.showKind ? level.displayLabel : "",
      level.showLabel ? node.label : "",
      level.showTitle ? node.title : "",
    ]
      .filter(Boolean)
      .join(" ");
    return sharedHeading || contextualHeading ? (
      <button
        type="button"
        className={[
          styles.unitHeading,
          isRoot ? styles.articleHeading : "",
        ].join(" ")}
        onClick={() => select(node.logicalId)}
      >
        {sharedHeading ? (
          <ConstitutionArticleHeading article={article} outline={outline} />
        ) : (
          contextualHeading
        )}
      </button>
    ) : null;
  }
  /** Footnotes remain in the endnote surface; body entries keep their original mixed ordering. */
  function renderNodeEntries(node: DraftNode): React.ReactNode[] {
    const items: React.ReactNode[] = [];
    for (let index = 0; index < node.content.length; index++) {
      const entry = node.content[index];
      if (entry.format === "footnote") continue;
      if (entry.node) index = appendChildRun(node, index, items);
      else if (entry.format === "table" && entry.table)
        items.push(renderTable(entry));
      else
        items.push(
          <div key={entry.logicalId} className={styles.paragraph}>
            {canvas([{ node, entry }], node.logicalId, true)}
          </div>,
        );
    }
    return items;
  }
  /** Adjacent simple children of one kind share a canvas, retaining the exact historical run boundary. */
  function appendChildRun(
    node: DraftNode,
    index: number,
    items: React.ReactNode[],
  ): number {
    const entry = node.content[index],
      child = entry.node!;
    const childLevel = outline.kinds.find(
        (level) => level.kindCode === child.kind,
      ),
      first = simpleUnit(child);
    if (
      first &&
      childLevel &&
      !childLevel.mayHoldChildren &&
      childLevel.allowedChildKinds.length === 0
    ) {
      const units = [first];
      while (index + 1 < node.content.length) {
        const next = node.content[index + 1].node;
        const unit = next && next.kind === child.kind ? simpleUnit(next) : null;
        if (!unit) break;
        units.push(unit);
        index++;
      }
      items.push(
        <div key={first.node.logicalId} className={styles.paragraph}>
          {canvas(units, node.logicalId)}
        </div>,
      );
    } else items.push(renderNode(child));
    return index;
  }

  /** Keeps table editing controls, generated identities and rich replacement callbacks unchanged. */
  function renderTable(entry: DraftEntry) {
    const table = entry.table!,
      editing = selection === entry.logicalId && panel === "table";
    const update = (next: typeof table) =>
      updateEntry(entry, {
        table: next,
        text: next.rows
          .map((row) => row.cells.map((cell) => cell.text).join(" "))
          .join("\n"),
      });
    const cell = (
      id: string,
      patch: Partial<(typeof table.rows)[number]["cells"][number]>,
    ) =>
      update({
        ...table,
        rows: table.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) =>
            cell.logicalId === id ? { ...cell, ...patch } : cell,
          ),
        })),
      });
    return (
      <div
        key={entry.logicalId}
        className={styles.table}
        data-editor-entry={entry.logicalId}
      >
        {editing ? (
          <fieldset>
            <legend>{copy("Edit table", "Tabelle bearbeiten")}</legend>
            <label>
              {t(ui.editor.structurededitor.caption)}
              <input
                value={table.caption ?? ""}
                onChange={(event) =>
                  update({ ...table, caption: event.target.value })
                }
              />
            </label>
            {table.rows.map((row, rowIndex) => (
              <div key={row.logicalId} className={styles.tableRow}>
                {row.cells.map((item, column) => (
                  <details key={item.logicalId} open>
                    <summary>
                      {copy("Cell", "Zelle")} {column + 1}
                    </summary>
                    <textarea
                      aria-label={copy("Cell text", "Zellentext")}
                      value={item.text}
                      onChange={(event) =>
                        cell(item.logicalId, { text: event.target.value })
                      }
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={item.header ?? false}
                        onChange={(event) =>
                          cell(item.logicalId, { header: event.target.checked })
                        }
                      />
                      {t(ui.editor.structurededitor.header)}
                    </label>
                    <label>
                      {t(ui.editor.structurededitor.rowSpan)}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={item.rowSpan ?? 1}
                        onChange={(event) =>
                          cell(item.logicalId, {
                            rowSpan: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      {t(ui.editor.structurededitor.columnSpan)}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={item.colSpan ?? 1}
                        onChange={(event) =>
                          cell(item.logicalId, {
                            colSpan: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      {t(ui.editor.structurededitor.headerCells)}
                      <select
                        multiple
                        value={item.headers ?? []}
                        onChange={(event) =>
                          cell(item.logicalId, {
                            headers: Array.from(
                              event.target.selectedOptions,
                              (option) => option.value,
                            ),
                          })
                        }
                      >
                        {table.rows
                          .flatMap((row) => row.cells)
                          .filter(
                            (cell) =>
                              cell.header && cell.logicalId !== item.logicalId,
                          )
                          .map((cell) => (
                            <option value={cell.logicalId} key={cell.logicalId}>
                              {cell.text || t(ui.editorDefaults.untitledHeader)}
                            </option>
                          ))}
                      </select>
                    </label>
                  </details>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update({
                      ...table,
                      rows: table.rows.map((current, at) =>
                        at === rowIndex
                          ? {
                              ...current,
                              cells: [
                                ...current.cells,
                                { logicalId: crypto.randomUUID(), text: "" },
                              ],
                            }
                          : current,
                      ),
                    })
                  }
                >
                  {t(ui.editor.structurededitor.cell2)}
                </button>
                <button
                  type="button"
                  disabled={table.rows.length < 2}
                  onClick={() =>
                    update({
                      ...table,
                      rows: table.rows.filter(
                        (current) => current.logicalId !== row.logicalId,
                      ),
                    })
                  }
                >
                  {t(ui.editor.structurededitor.removeRow)}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                update({
                  ...table,
                  rows: [
                    ...table.rows,
                    {
                      logicalId: crypto.randomUUID(),
                      cells: [{ logicalId: crypto.randomUUID(), text: "" }],
                    },
                  ],
                })
              }
            >
              {t(ui.editor.structurededitor.row)}
            </button>
            <button type="button" onClick={() => setPanel("")}>
              {copy("Done", "Fertig")}
            </button>
          </fieldset>
        ) : (
          <>
            <table>
              {table.caption ? <caption>{table.caption}</caption> : null}
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.logicalId}>
                    {row.cells.map((cell) =>
                      cell.header ? (
                        <th
                          key={cell.logicalId}
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                        >
                          {cell.text}
                        </th>
                      ) : (
                        <td
                          key={cell.logicalId}
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                        >
                          {cell.text}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {editable ? (
              <button
                type="button"
                disabled={Boolean(noteEdit)}
                onClick={() => {
                  select(entry.logicalId!);
                  setPanel("table");
                }}
              >
                {copy("Edit table", "Tabelle bearbeiten")}
              </button>
            ) : null}
          </>
        )}
      </div>
    );
  }

  /** Groups only adjacent simple siblings sharing the same parent and exact original order. */
  function renderFocusedNodes() {
    const items: React.ReactNode[] = [];
    const parentOf = (node: DraftNode) =>
      allNodes.find((parent) =>
        parent.content.some(
          (entry) => entry.node?.logicalId === node.logicalId,
        ),
      );
    const position = (node: DraftNode, parent?: DraftNode) =>
      parent
        ? parent.content.findIndex(
            (entry) => entry.node?.logicalId === node.logicalId,
          )
        : roots.indexOf(node);
    for (let index = 0; index < focusedNodes.length; index++) {
      const node = focusedNodes[index];
      if (
        !loadedRootIds.includes(node.logicalId) &&
        roots.some((root) => root.logicalId === node.logicalId) &&
        !node.content.length
      ) {
        items.push(
          <section key={node.logicalId} className={styles.unit}>
            <button
              type="button"
              disabled={loading}
              onClick={() => void navigateRoot(node.logicalId)}
            >
              {kindName(node.kind)} {node.label} {node.title}
            </button>
          </section>,
        );
        continue;
      }
      const first = simpleUnit(node),
        level = outline.kinds.find((level) => level.kindCode === node.kind),
        parent = parentOf(node),
        units = first ? [first] : [];
      if (
        first &&
        level &&
        !level.mayHoldChildren &&
        !level.allowedChildKinds.length
      ) {
        while (index + 1 < focusedNodes.length) {
          const next = focusedNodes[index + 1],
            unit = simpleUnit(next);
          if (
            !unit ||
            next.kind !== node.kind ||
            parentOf(next)?.logicalId !== parent?.logicalId ||
            position(next, parent) !== position(units.at(-1)!.node, parent) + 1
          )
            break;
          units.push(unit);
          index++;
        }
      }
      items.push(
        units.length > 1 ? (
          <section key={node.logicalId} data-editor-unit={node.logicalId}>
            {canvas(units, parent?.logicalId ?? null)}
          </section>
        ) : (
          renderNode(node)
        ),
      );
    }
    return items;
  }

  /** Keeps the same note editor canvas, labels and Apply/Cancel/remove actions without a new React boundary. */
  const noteEditor = (id?: string) =>
    noteEdit && noteEdit.id === id ? (
      <div
        className={styles.noteEditor}
        id={id ? "editor-fn-" + id : "editor-new-note"}
      >
        <label>
          {t(ui.editor.structurededitor.footnoteLabel)}
          <input
            aria-label={copy("Footnote label", "Fußnotenbezeichnung")}
            value={noteEdit.label}
            onChange={(event) =>
              updateNoteDraft({ ...noteEdit, label: event.target.value })
            }
          />
        </label>
        <span>{copy("Footnote text", "Fußnotentext")}</span>
        <ContinuousCanvas
          units={[
            {
              node: {
                logicalId: id ?? "new-note-node",
                kind: "footnote",
                content: [],
              },
              entry: {
                type: "text",
                logicalId: id ?? "new-note-text",
                text: noteEdit.text,
                marks: noteEdit.marks ?? [],
              },
            },
          ]}
          resetVersion={canvasReset}
          label={copy("Footnote text", "Fußnotentext")}
          active
          editable
          flowing
          boundaries={false}
          automatic={false}
          delimiters={[]}
          notes={[]}
          onActivate={(controller) => {
            setActiveCanvas(controller);
            setActiveMarks(controller.activeMarks());
          }}
          onChange={(blocks) => {
            let offset = 0;
            const marks: OrderedTextMark[] = [];
            for (const block of blocks) {
              marks.push(
                ...block.marks.map((mark) => ({
                  ...mark,
                  start: mark.start + offset,
                  end: mark.end + offset,
                })),
              );
              offset += block.text.length;
            }
            updateNoteDraft({
              ...noteEdit,
              text: blocks.map((block) => block.text).join(""),
              marks: normalizeMarks(marks),
            });
          }}
          onUndo={() => travel()}
          onRedo={() => travel(true)}
        />
        {noteError ? <p role="alert">{noteError}</p> : null}
        <div className={styles.actions}>
          <button
            type="button"
            disabled={loading}
            onClick={() => void applyNote()}
          >
            {id
              ? copy("Apply changes", "Änderungen anwenden")
              : copy(
                  "Insert marker and note",
                  "Verweiszeichen und Fußnote einfügen",
                )}
          </button>
          <button type="button" onClick={closeNoteEditor}>
            {copy("Cancel", "Abbrechen")}
          </button>
          {id ? (
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void removeNote(
                  notes.find((note) => note.entry.logicalId === id)!,
                )
              }
            >
              {copy(
                "Remove footnote and its references",
                "Fußnote und ihre Verweise entfernen",
              )}
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

  /** Preserves tab controls, contextual wiki/details links and history availability. */
  function renderViewBar() {
    return (
      <div
        className={styles.viewbar}
        data-editor-views
        role="group"
        aria-label={copy("Editor views", "Editoransichten")}
      >
        <EditorNavigationToggle />
        <button
          type="button"
          aria-label={copy("Edit", "Bearbeiten")}
          title={copy("Edit", "Bearbeiten")}
          aria-pressed={mode === "edit"}
          onClick={() => {
            setMode("edit");
            requestAnimationFrame(() => {
              const target = noteEdit ? activeCanvas : bodyCanvas.current;
              if (target?.isAlive()) target.focus();
              else
                rootRef.current
                  ?.querySelector<HTMLElement>("[role=textbox]")
                  ?.focus({ preventScroll: true });
            });
          }}
        >
          <Pencil size={17} aria-hidden="true" />
          <span className={styles.viewLabel}>{copy("Edit", "Bearbeiten")}</span>
        </button>
        <button
          type="button"
          aria-label={
            copy("Changes", "Änderungen") + " (" + differences.length + ")"
          }
          title={
            copy("Changes", "Änderungen") + " (" + differences.length + ")"
          }
          aria-pressed={mode === "changes"}
          disabled={Boolean(noteEdit || markerMove)}
          onClick={() => setMode("changes")}
        >
          <GitCompare size={17} aria-hidden="true" />
          <span className={styles.viewLabel}>
            {copy("Changes", "Änderungen")} ({differences.length})
          </span>
        </button>
        <button
          type="button"
          aria-label={copy("Preview", "Vorschau")}
          title={copy("Preview", "Vorschau")}
          aria-pressed={mode === "preview"}
          disabled={Boolean(noteEdit || markerMove)}
          onClick={() => void showPreview()}
        >
          <Eye size={17} aria-hidden="true" />
          <span className={styles.viewLabel}>
            {copy("Preview", "Vorschau")}
          </span>
        </button>
        {wikiPanel ? (
          <button
            type="button"
            aria-label={copy("Wiki", "Wiki")}
            title={copy("Wiki", "Wiki")}
            aria-pressed={mode === "wiki"}
            disabled={Boolean(noteEdit || markerMove)}
            onClick={() => {
              setMode("wiki");
              setPanel("");
            }}
          >
            <BookOpen size={17} aria-hidden="true" />
            <span className={styles.viewLabel}>{copy("Wiki", "Wiki")}</span>
          </button>
        ) : (
          <a
            href={
              "/editor/wiki/constitution/" + encodeURIComponent(constitutionId)
            }
            aria-label={copy("Wiki", "Wiki")}
            title={copy("Wiki", "Wiki")}
            aria-disabled={Boolean(noteEdit)}
            onClick={(event) => {
              if (noteEdit) event.preventDefault();
            }}
          >
            <BookOpen size={17} aria-hidden="true" />
            <span className={styles.viewLabel}>{copy("Wiki", "Wiki")}</span>
          </a>
        )}
        {detailsPanel ? (
          <button
            type="button"
            aria-label={copy("Details", "Details")}
            title={copy("Details", "Details")}
            aria-pressed={mode === "details"}
            disabled={Boolean(noteEdit || markerMove)}
            onClick={() => {
              setMode("details");
              setPanel("");
            }}
          >
            <Info size={17} aria-hidden="true" />
            <span className={styles.viewLabel}>
              {copy("Details", "Details")}
            </span>
          </button>
        ) : null}
        {documentsPanel ? (
          <button type="button" aria-label={copy("Documents", "Dokumente")}
            title={copy("Documents", "Dokumente")} aria-pressed={mode === "documents"}
            disabled={Boolean(noteEdit || markerMove)} onClick={() => {setMode("documents"); setPanel("");}}>
            <FileText size={17} aria-hidden="true" />
            <span className={styles.viewLabel}>{copy("Documents", "Dokumente")}</span>
          </button>
        ) : null}
        {canManageStructure ? (
          <a
            className={styles.iconButton}
            aria-label={copy(
              "Constitution structure settings",
              "Verfassungsstruktur",
            )}
            title={copy(
              "Constitution structure settings",
              "Verfassungsstruktur",
            )}
            href={"/admin/constitutions/" + constitutionId}
          >
            <Settings2 size={17} aria-hidden="true" />
          </a>
        ) : null}
        {mode === "changes" || mode === "preview" ? (
          <>
            <span className={styles.spacer} />
            <span
              className={styles.history}
              role="group"
              aria-label={copy("Edit history", "Bearbeitungsverlauf")}
            >
              <IconTool
                name={copy("Undo", "Rückgängig")}
                icon={Undo2}
                onClick={() => travel()}
                disabled={!history.length || !editable}
              />
              <IconTool
                name={copy("Redo", "Wiederholen")}
                icon={Redo2}
                onClick={() => travel(true)}
                disabled={!future.length || !editable}
              />
            </span>
          </>
        ) : null}
      </div>
    );
  }

  /** Keeps the same sticky edit controls and current canvas formatting state. */
  function renderEditToolbar() {
    return (
      <div className={styles.toolbar} data-editor-tools>
        <span
          className={styles.context}
          role="note"
          aria-label={t(ui.accessibility.selectionInspector)}
        >
          {noteEdit
            ? copy("Footnote", "Fußnote") + " " + noteEdit.label
            : kindName(selectedUnit.kind) + " " + (selectedUnit.label ?? "")}
          {!noteEdit && selectedEntry ? " › " + copy("Text", "Text") : ""}
        </span>
        <div
          className={styles.tools}
          role="group"
          aria-label={copy("Editing tools", "Bearbeitungswerkzeuge")}
        >
          <IconTool
            name={copy("Undo", "Rückgängig")}
            icon={Undo2}
            onClick={() => travel()}
            disabled={
              (noteEdit ? !noteHistory.length : !history.length) ||
              !editable ||
              Boolean(markerMove)
            }
          />
          <IconTool
            name={copy("Redo", "Wiederholen")}
            icon={Redo2}
            onClick={() => travel(true)}
            disabled={
              (noteEdit ? !noteFuture.length : !future.length) ||
              !editable ||
              Boolean(markerMove)
            }
          />
          <span className={styles.separator} />
          {(["bold", "italic", "underline", "strikethrough"] as const).map(
            (type, index) => (
              <span key={type}>
                {
                  <IconTool
                    name={
                      [
                        copy("Bold", "Fett"),
                        copy("Italic", "Kursiv"),
                        copy("Underline", "Unterstrichen"),
                        copy("Strikethrough", "Durchgestrichen"),
                      ][index]
                    }
                    icon={[Bold, Italic, Underline, Strikethrough][index]}
                    onClick={() => activeCanvas?.format(type)}
                    pressed={
                      activeMarks.includes("mixed:" + type)
                        ? "mixed"
                        : activeMarks.includes(type)
                    }
                    disabled={!editable || !activeCanvas}
                  />
                }
              </span>
            ),
          )}
          {!noteEdit &&
          selectedEntry?.format !== "footnote" &&
          (activeLevel.presentation === "concatenated" ||
            outline.kinds.some(
              (level) =>
                level.presentation === "concatenated" && !selectedEntry,
            )) ? (
            <IconTool
              name={copy("Show sentence boundaries", "Satzgrenzen anzeigen")}
              icon={SquareDashed}
              onClick={() => setBoundaries(!boundaries)}
              pressed={boundaries}
            />
          ) : null}
          <span className={styles.separator} />
          {
            <IconTool
              name={copy("Insert", "Einfügen")}
              icon={Plus}
              onClick={() => setPanel(panel === "insert" ? "" : "insert")}
              pressed={panel === "insert"}
              disabled={!editable || Boolean(noteEdit || markerMove)}
            />
          }
          {
            <IconTool
              name={copy("Text tools", "Textwerkzeuge")}
              icon={TextCursorInput}
              onClick={() => setPanel(panel === "text" ? "" : "text")}
              pressed={panel === "text"}
              disabled={!editable || Boolean(noteEdit || markerMove)}
            />
          }
          {
            <IconTool
              name={copy("References", "Verweise")}
              icon={Link}
              onClick={() =>
                setPanel(panel === "references" ? "" : "references")
              }
              pressed={panel === "references"}
              disabled={!editable || Boolean(noteEdit || markerMove)}
            />
          }
          {
            <IconTool
              name={copy("Unit properties", "Eigenschaften")}
              icon={SlidersHorizontal}
              onClick={() =>
                setPanel(panel === "properties" ? "" : "properties")
              }
              pressed={panel === "properties"}
              disabled={Boolean(noteEdit || markerMove)}
            />
          }
          {
            <IconTool
              name={copy("Footnotes", "Fußnoten")}
              icon={Superscript}
              onClick={() => setPanel(panel === "footnotes" ? "" : "footnotes")}
              pressed={panel === "footnotes"}
              disabled={Boolean(noteEdit)}
            />
          }
          <IconTool
            name={copy("Editor view", "Editoransicht")}
            disabled={Boolean(noteEdit)}
            icon={ListTree}
            onClick={() => setPanel(panel === "view" ? "" : "view")}
            pressed={panel === "view"}
          />
        </div>
        {markerMove ? (
          <div className={styles.markerMove} role="status">
            <span>
              {copy(
                "Choose the new marker position.",
                "Wählen Sie die neue Position des Verweiszeichens.",
              )}
            </span>
            <button
              type="button"
              disabled={loading || !activeCanvas?.isAlive()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void placeMarker()}
            >
              {copy("Place marker", "Verweiszeichen platzieren")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMarkerMove(null);
                setMessage("");
              }}
            >
              {copy("Cancel move", "Verschieben abbrechen")}
            </button>
          </div>
        ) : null}
        {panel && panel !== "table" ? renderToolPanel() : null}
      </div>
    );
  }

  /** Renders one selected tool panel with its existing close control and semantics. */
  function renderToolPanel() {
    return (
      <section
        className={styles.toolPanel}
        data-tool-panel
        aria-label={copy("Selected tool", "Ausgewähltes Werkzeug")}
      >
        <div className={styles.panelHead}>
          <strong>
            {
              (
                {
                  insert: copy("Insert", "Einfügen"),
                  text: copy("Text tools", "Textwerkzeuge"),
                  references: copy("References", "Verweise"),
                  properties: copy("Unit properties", "Eigenschaften"),
                  footnotes: copy("Footnotes", "Fußnoten"),
                  view: copy("Editor view", "Editoransicht"),
                } as Record<string, string>
              )[panel]
            }
          </strong>
          {
            <IconTool
              name={copy("Close tools", "Werkzeuge schließen")}
              icon={X}
              onClick={() => setPanel("")}
            />
          }
        </div>
        {renderViewPanel()}
        {renderInsertPanel()}
        {renderTextPanel()}
        {renderReferencesPanel()}
        {renderPropertiesPanel()}
        {renderFootnotesPanel()}
      </section>
    );
  }

  /** Preserves the view panel controls and command callbacks. */
  function renderViewPanel() {
    return panel === "view" ? (
      <>
        <label>
          {t(ui.editor.structurededitor.editorView)}
          <select
            value={scope}
            disabled={loading}
            onChange={(event) => void changeScope(event.target.value)}
          >
            <option value="constitution">
              {t(ui.editor.structurededitor.constitution)}
            </option>
            {outline.kinds.map((level) => (
              <option key={level.kindCode} value={level.kindCode}>
                {level.displayLabel}
              </option>
            ))}
          </select>
        </label>
        <nav className={styles.menu}>
          {(overviewRoots.length ? overviewRoots : roots).map((root) => (
            <button
              type="button"
              disabled={loading}
              key={root.logicalId}
              onClick={() => void navigateRoot(root.logicalId)}
            >
              {kindName(root.kind)} {root.label} {root.title}
            </button>
          ))}
        </nav>
      </>
    ) : null;
  }

  /** Preserves the insert panel controls and command callbacks. */
  function renderInsertPanel() {
    return panel === "insert" ? (
      <div className={styles.menu}>
        <label>
          {copy("Position", "Position")}
          <select
            value={insertPosition}
            onChange={(event) => setInsertPosition(event.target.value)}
          >
            <option value="before">
              {copy("Before selection", "Vor der Auswahl")}
            </option>
            <option value="after">
              {copy("After selection", "Nach der Auswahl")}
            </option>
            <option value="start">
              {copy("Start of unit", "Anfang der Einheit")}
            </option>
            <option value="end">
              {copy("End of unit", "Ende der Einheit")}
            </option>
          </select>
        </label>
        {activeLevel.mayHoldText ? (
          <>
            <button type="button" onClick={() => insert()}>
              {t(ui.editorDynamic.text)}
            </button>
            <button type="button" onClick={() => insert(undefined, "table")}>
              {t(ui.editor.structurededitor.table)}
            </button>
          </>
        ) : null}
        {activeLevel.allowedChildKinds.map((code) => (
          <button type="button" key={code} onClick={() => insert(code)}>
            {kindName(code)}
          </button>
        ))}
        <button type="button" onClick={newNote}>
          {copy("New footnote…", "Neue Fußnote…")}
        </button>
        {rootKinds.map((level) => (
          <button
            type="button"
            key={level.kindCode}
            onClick={() => {
              const at = roots.indexOf(currentRoot);
              change({
                type: "insert_root",
                targetId: currentRoot.logicalId,
                expectedRevisionId: token(currentRoot),
                position: at + 1,
                node: createNode(level.kindCode),
              });
              setPanel("");
            }}
          >
            {copy(
              "Add top-level unit",
              "Einheit auf oberster Ebene hinzufügen",
            )}{" "}
            · {level.displayLabel}
          </button>
        ))}
      </div>
    ) : null;
  }

  /** Preserves the text panel controls and command callbacks. */
  function renderTextPanel() {
    return panel === "text" ? (
      <div className={styles.menu}>
        {eligible(activeLevel) ? (
          <button
            type="button"
            onClick={() => {
              activeCanvas?.segment();
              setPanel("");
            }}
          >
            {t(ui.editor.structurededitor.suggestSentenceBoundaries)}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            activeCanvas?.split();
            setPanel("");
          }}
        >
          {t(ui.editor.structurededitor.splitAtCursor)}
        </button>
        <button
          type="button"
          onClick={() => {
            activeCanvas?.merge();
            setPanel("");
          }}
        >
          {t(ui.editor.structurededitor.mergeWithNextSentence)}
        </button>
      </div>
    ) : null;
  }

  /** Preserves the references panel controls and command callbacks. */
  function renderReferencesPanel() {
    return panel === "references" ? (
      <>
        <label>
          {t(ui.editor.structurededitor.referenceTarget)}
          <select
            value={referenceTarget}
            onChange={(event) => setReferenceTarget(event.target.value)}
          >
            <option value="">
              {t(ui.editor.structurededitor.chooseATarget)}
            </option>
            {allNodes.map((node) => (
              <option key={node.logicalId} value={"unit:" + node.logicalId}>
                {kindName(node.kind)} {node.label ?? node.title}
              </option>
            ))}
            {notes.map((note) => (
              <option
                key={note.entry.logicalId}
                value={"footnote:" + note.entry.logicalId}
              >
                {copy("Footnote", "Fußnote")} {note.entry.footnoteLabel}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const [type, id] = referenceTarget.split(":");
            if (id)
              link(
                type === "footnote"
                  ? { type, footnoteId: id }
                  : { type: "unit", logicalId: id },
              );
          }}
        >
          {t(ui.editor.structurededitor.linkSelection)}
        </button>
        <label>
          {copy("HTTPS URL", "HTTPS-URL")}
          <input
            type="url"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!externalUrl.startsWith("https://")}
          onClick={() => link({ type: "external", url: externalUrl })}
        >
          {t(ui.editor.structurededitor.linkToUrl)}
        </button>
        {selectedEntry?.references?.map((reference) => (
          <button
            type="button"
            key={reference.logicalId}
            onClick={() =>
              updateEntry(selectedEntry, {
                references: selectedEntry.references?.filter(
                  (item) => item.logicalId !== reference.logicalId,
                ),
              })
            }
          >
            {t(ui.editor.structurededitor.removeLink)}{" "}
            {(selectedEntry.text ?? "").slice(reference.start, reference.end)}
          </button>
        ))}
      </>
    ) : null;
  }

  /** Preserves the properties panel controls and command callbacks. */
  function renderPropertiesPanel() {
    return panel === "properties" ? (
      <>
        {(["label", "title"] as const).map((field) => {
          const policy =
            field === "label"
              ? activeLevel.labelPolicy
              : activeLevel.titlePolicy;
          return policy !== "none" ? (
            <label key={field}>
              {field === "label"
                ? t(ui.editor.structurededitor.literalLabel)
                : t(ui.editor.structurededitor.title)}
              <input
                aria-label={
                  activeLevel.displayLabel +
                  " " +
                  (field === "label"
                    ? t(ui.editorDefaults.literalLabel)
                    : t(ui.editorDefaults.titleLabel))
                }
                required={policy === "required"}
                disabled={!editable}
                value={selectedUnit[field] ?? ""}
                onChange={(event) =>
                  change({
                    type: "set_metadata",
                    targetId: selectedUnit.logicalId,
                    expectedRevisionId: token(selectedUnit),
                    label: selectedUnit.label,
                    title: selectedUnit.title,
                    [field]: event.target.value,
                  })
                }
              />
            </label>
          ) : null;
        })}
        {editable ? (
          <div className={styles.menu}>
            <button type="button" onClick={() => moveSelected(-1)}>
              {t(ui.editor.structurededitor.moveUnitEarlier)}
            </button>
            <button type="button" onClick={() => moveSelected(1)}>
              {t(ui.editor.structurededitor.moveUnitLater)}
            </button>
            <button
              type="button"
              disabled={
                roots.length === 1 &&
                selectedUnit.logicalId === roots[0].logicalId
              }
              onClick={() => {
                change({
                  type: "remove",
                  targetId: selectedEntry?.logicalId ?? selectedUnit.logicalId,
                  expectedRevisionId: token(selectedEntry ?? selectedUnit),
                });
                setPanel("");
              }}
            >
              {selectedEntry
                ? t(ui.editor.structurededitor.removeText)
                : t(ui.editor.structurededitor.removeUnit)}
            </button>
          </div>
        ) : null}
      </>
    ) : null;
  }

  /** Preserves the footnotes panel controls and command callbacks. */
  function renderFootnotesPanel() {
    return panel === "footnotes" ? (
      <div className={styles.menu}>
        <button
          type="button"
          onClick={newNote}
          disabled={!editable || Boolean(markerMove)}
        >
          {copy("New footnote…", "Neue Fußnote…")}
        </button>
        <label>
          <input
            type="checkbox"
            checked={onlyUnmarked}
            onChange={(event) => setOnlyUnmarked(event.target.checked)}
          />
          {copy("Unmarked footnotes only", "Nur Fußnoten ohne Verweiszeichen")}
        </label>
        {activeMarker &&
        noteReferences.some(
          (reference) => reference.referenceId === activeMarker.referenceId,
        ) ? (
          <div>
            <strong>
              {copy("Selected marker", "Ausgewähltes Verweiszeichen")}
            </strong>
            <button
              type="button"
              onClick={() =>
                void beginMarkerMove(
                  activeMarker.noteId,
                  activeMarker.referenceId,
                )
              }
              disabled={!editable || Boolean(markerMove)}
            >
              {copy(
                "Move selected marker…",
                "Ausgewähltes Verweiszeichen verschieben…",
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                void removeMarker(activeMarker.noteId, activeMarker.referenceId)
              }
              disabled={!editable || Boolean(markerMove)}
            >
              {copy(
                "Remove selected marker",
                "Ausgewähltes Verweiszeichen entfernen",
              )}
            </button>
          </div>
        ) : null}
        {notes
          .filter(
            (note) => !onlyUnmarked || markerCount(note.entry.logicalId!) === 0,
          )
          .map((note) => (
            <div key={note.entry.logicalId}>
              <button
                type="button"
                onClick={() =>
                  link({ type: "footnote", footnoteId: note.entry.logicalId! })
                }
                disabled={!editable || Boolean(markerMove)}
              >
                {copy(
                  "Add marker for footnote",
                  "Verweiszeichen für Fußnote hinzufügen",
                )}{" "}
                {note.entry.footnoteLabel}
              </button>
              <button
                type="button"
                disabled={Boolean(markerMove)}
                onClick={() => {
                  openNoteEditor({
                    id: note.entry.logicalId ?? undefined,
                    label: note.entry.footnoteLabel ?? "",
                    text: note.entry.text ?? "",
                    marks: note.entry.marks,
                  });
                  setPanel("");
                  requestAnimationFrame(() =>
                    document
                      .getElementById("editor-fn-" + note.entry.logicalId)
                      ?.scrollIntoView({ block: "nearest" }),
                  );
                }}
              >
                {copy("Edit footnote", "Fußnote bearbeiten")}{" "}
                {note.entry.footnoteLabel}
              </button>
            </div>
          ))}
      </div>
    ) : null;
  }

  /** Renders stable change navigation and the unchanged overview payload. */
  function renderChanges() {
    return (
      <section
        className={styles.changes}
        aria-label={copy("Changes", "Änderungen")}
      >
        {differences.length ? (
          <>
            <div className={styles.actions}>
              {
                <IconTool
                  name={copy("Previous change", "Vorherige Änderung")}
                  icon={ChevronLeft}
                  onClick={() => {
                    void navigateDifference(
                      (changeIndex - 1 + differences.length) %
                        differences.length,
                    );
                  }}
                />
              }
              {
                <IconTool
                  name={copy("Next change", "Nächste Änderung")}
                  icon={ChevronRight}
                  onClick={() => {
                    void navigateDifference(
                      (changeIndex + 1) % differences.length,
                    );
                  }}
                />
              }
            </div>
            <ChangeOverview
              differences={differences.map((difference) => ({
                ...difference,
                sourceLink:
                  difference.sourceLink ??
                  differenceReference(difference.logicalId, false),
                targetLink:
                  difference.targetLink ??
                  differenceReference(difference.logicalId, true),
              }))}
              roots={roots}
              sourceRoots={sourceRoots}
              outline={outline}
              onNavigate={(index) => void navigateDifference(index)}
            />
          </>
        ) : (
          <p>{t(ui.editor.structurededitor.noChanges)}</p>
        )}
      </section>
    );
  }

  /** Uses the shared legal-text renderer for exact ordered preview content. */
  function renderPreviewDocument() {
    return (
      <div className={styles.document}>
        <ConstitutionDocument>
          {focusedNodes.map((node) => (
            <ConstitutionText
              key={node.logicalId}
              headingLevel="h2"
              article={{
                articleNumber: node.label ?? "",
                title: node.title ?? "",
                kind: node.kind,
                body: "",
                content: readerNode(node).content,
              }}
              outline={outline}
              hideFootnotes
              crossRefs={{
                versionId,
                articlesByNumber: {},
                footnotes: notes.map((note) => ({
                  logicalId: note.entry.logicalId!,
                  label: note.entry.footnoteLabel ?? "*",
                  text: note.entry.text ?? "",
                  marks: note.entry.marks,
                  href: "#editor-fn-" + note.entry.logicalId,
                })),
              }}
            />
          ))}
        </ConstitutionDocument>
      </div>
    );
  }

  /** Keeps indexed footnote actions, backlinks and in-place note editing unchanged. */
  function renderEndnotes() {
    return (
      <div className={styles.endnotes}>
        <ConstitutionFootnotes
          indexedBacklinks={
            mode === "preview"
              ? footnoteBacklinks(
                  focusedNodes.flatMap((node) => readerNode(node).content),
                )
              : undefined
          }
          backlinkIdPrefix={mode === "preview" ? "" : undefined}
          entries={visibleNotes.map((note) => ({
            ...note.entry,
            type: "text" as const,
            node: undefined,
            revisionId: token(note.entry),
            occurrenceId: note.entry.logicalId,
          }))}
          outline={outline}
          idPrefix="editor-"
          renderFootnote={(entry, element) =>
            noteEdit?.id === entry.logicalId
              ? noteEditor(entry.logicalId!)
              : element
          }
          footnoteActions={
            editable && mode === "edit"
              ? (entry) => (
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={Boolean(noteEdit)}
                    aria-label={
                      copy("Edit footnote", "Fußnote bearbeiten") +
                      " " +
                      entry.footnoteLabel
                    }
                    title={
                      copy("Edit footnote", "Fußnote bearbeiten") +
                      " " +
                      entry.footnoteLabel
                    }
                    onClick={() =>
                      openNoteEditor({
                        id: entry.logicalId ?? undefined,
                        label: entry.footnoteLabel ?? "",
                        text: entry.text ?? "",
                        marks: entry.marks,
                      })
                    }
                  >
                    <Pencil size={17} aria-hidden="true" />
                  </button>
                )
              : undefined
          }
        >
          {noteEdit && !noteEdit.id ? noteEditor() : null}
        </ConstitutionFootnotes>
      </div>
    );
  }

  /** Preserves save controls, validation state and native submission behavior. */
  function renderFooter() {
    return (
      <div className={styles.footer}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={
            loading ||
            !operations.length ||
            errors.length > 0 ||
            Boolean(noteEdit) ||
            Boolean(markerMove) ||
            (saveAttempted && noteProblems.length > 0)
          }
        >
          {t(ui.editor.structurededitor.saveDraft)}
        </button>
      </div>
    );
  }

  /** Builds the same formatting/text context actions against the selected canvas. */
  function renderTextContext() {
    return textContext ? (
      <EditorContextMenu
        anchor={textContext.anchor}
        label={
          textContext.formatting
            ? copy("Formatting", "Formatierung")
            : copy("Text tools", "Textwerkzeuge")
        }
        onClose={() => setTextContext(null)}
        items={
          textContext.formatting
            ? (["bold", "italic", "underline", "strikethrough"] as const).map(
                (type, index) => ({
                  label: [
                    copy("Bold", "Fett"),
                    copy("Italic", "Kursiv"),
                    copy("Underline", "Unterstrichen"),
                    copy("Strikethrough", "Durchgestrichen"),
                  ][index],
                  onSelect: () => activeCanvas?.format(type),
                }),
              )
            : [
                {
                  label: copy("New footnote…", "Neue Fußnote…"),
                  onSelect: newNote,
                  disabled: Boolean(markerMove),
                },
                ...(textContext.selected
                  ? [
                      {
                        label: copy("Link selection…", "Auswahl verlinken…"),
                        onSelect: () => setPanel("references"),
                        disabled: Boolean(markerMove),
                      },
                    ]
                  : []),
                ...(!markerMove && textContext.canSplit
                  ? [
                      {
                        label: t(ui.editor.structurededitor.splitAtCursor),
                        onSelect: () => activeCanvas?.split(),
                      },
                    ]
                  : []),
                ...(!markerMove && textContext.canMerge
                  ? [
                      {
                        label: t(
                          ui.editor.structurededitor.mergeWithNextSentence,
                        ),
                        onSelect: () => activeCanvas?.merge(),
                      },
                    ]
                  : []),
                {
                  label: copy("Formatting…", "Formatierung…"),
                  onSelect: () =>
                    setTextContext({ ...textContext, formatting: true }),
                },
                {
                  label: copy("Unit properties", "Eigenschaften"),
                  onSelect: () => {
                    setPanel("properties");
                    requestAnimationFrame(() =>
                      rootRef.current
                        ?.querySelector<HTMLInputElement>(
                          "[data-tool-panel] input",
                        )
                        ?.focus(),
                    );
                  },
                  disabled: Boolean(markerMove),
                },
              ]
        }
      />
    ) : null;
  }

  /** Preserves marker navigation, clipboard pinning and move/remove actions. */
  function renderMarkerContext() {
    return markerContext ? (
      <FootnoteMarkerMenu
        copyDisabled={operations.length > 0}
        onCopyLink={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("selectedNode", markerContext.textId);
          url.searchParams.set("tab", "edit");
          for (const key of ["wikiStatus", "wikiHistoryPage", "historyPage"])
            url.searchParams.delete(key);
          url.hash = "editor-ref-" + markerContext.referenceId;
          void navigator.clipboard.writeText(url.toString()).then(
            () =>
              setMessage(
                copy(
                  "Link to marker copied.",
                  "Link zum Verweiszeichen kopiert.",
                ),
              ),
            () =>
              setMessage(
                copy(
                  "The link could not be copied.",
                  "Der Link konnte nicht kopiert werden.",
                ),
              ),
          );
        }}
        anchor={markerContext.anchor}
        label={
          notes.find((note) => note.entry.logicalId === markerContext.noteId)
            ?.entry.footnoteLabel ?? "*"
        }
        onClose={() => setMarkerContext(null)}
        onMove={() =>
          void beginMarkerMove(markerContext.noteId, markerContext.referenceId)
        }
        onRemove={() =>
          void removeMarker(markerContext.noteId, markerContext.referenceId)
        }
        onEdit={() => {
          const note = notes.find(
            (note) => note.entry.logicalId === markerContext.noteId,
          );
          if (note)
            openNoteEditor({
              id: note.entry.logicalId!,
              label: note.entry.footnoteLabel ?? "*",
              text: note.entry.text ?? "",
              marks: note.entry.marks,
            });
        }}
        onNavigate={() =>
          void navigateNote(markerContext.noteId).then(() =>
            document
              .getElementById("editor-fn-" + markerContext.noteId)
              ?.scrollIntoView({ block: "center" }),
          )
        }
      />
    ) : null;
  }
  return (
    <FootnoteProvider
      notes={notes.map((note) => ({
        logicalId: note.entry.logicalId!,
        label: note.entry.footnoteLabel ?? "*",
        text: note.entry.text ?? "",
        marks: note.entry.marks,
        href: "#editor-fn-" + note.entry.logicalId,
      }))}
      onNavigate={(note) => navigateNote(note.logicalId)}
    >
      <div
        ref={rootRef}
        data-editor-workspace
        className={styles.editor}
        style={
          { "--editor-toolbar-top": toolbarTop + "px" } as React.CSSProperties
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPanel("");
            if (mode === "edit") activeCanvas?.focus();
          }
        }}
      >
        {renderViewBar()}
        <form
          action="/editor/command"
          method="post"
          id="draft-form"
          className={styles.textForm}
          hidden={mode === "wiki" || mode === "details" || mode === "documents"}
          onSubmit={(event) => {
            if (noteProblems.length) {
              event.preventDefault();
              setSaveAttempted(true);
              setMessage(noteProblemText(noteProblems[0]));
              return;
            }
            saving.current = true;
          }}
        >
          <input type="hidden" name="command" value="structured-save" />
          <input type="hidden" name="sessionId" value={preview.sessionId} />
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="articleId" value={articleId} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="selectedNode" value={selection} />
          <input
            type="hidden"
            name="structuredDraft"
            value={JSON.stringify({
              expectedGeneration: preview.generation,
              operations,
            })}
          />

          {mode === "edit" ? renderEditToolbar() : null}
          {saveAttempted && noteProblems.length ? (
            <div role="alert" className={styles.validation}>
              <ul>
                {noteProblems.map((problem) => (
                  <li key={problem.noteId}>{noteProblemText(problem)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p role="status" className={styles.status}>
            {loading
              ? t(ui.editorDynamic.loadingEditor)
              : message ||
                t(
                  preview.operations.length
                    ? ui.editor.structurededitor.savedDraft
                    : ui.editor.structurededitor.sourceSnapshot,
                )}
          </p>
          {errors.length ? (
            <details className={styles.validation}>
              <summary>
                {copy("Needs attention", "Zu prüfen")} ({errors.length})
              </summary>
              <div role="alert">
                {notes.length && editable ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void normalizeEndnotes()}
                  >
                    {copy(
                      "Move footnotes to the constitution’s end",
                      "Fußnoten ans Verfassungsende verschieben",
                    )}
                  </button>
                ) : null}
                <ul>
                  {[...new Set(errors)].map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
          {mode === "changes" ? (
            renderChanges()
          ) : mode === "preview" ? (
            renderPreviewDocument()
          ) : (
            <div className={styles.document}>{renderFocusedNodes()}</div>
          )}
          {mode !== "changes" && (visibleNotes.length || noteEdit)
            ? renderEndnotes()
            : null}
          {editable ? renderFooter() : null}
        </form>
        {documentsPanel ? <div hidden={mode !== "documents"} data-editor-panel="documents">{documentsPanel}</div> : null}
        {wikiPanel ? (
          <div hidden={mode !== "wiki"} data-editor-panel="wiki">
            {wikiPanel}
          </div>
        ) : null}
        {detailsPanel ? (
          <div hidden={mode !== "details"} data-editor-panel="details">
            {detailsPanel}
          </div>
        ) : null}
        {renderTextContext()}
        {renderMarkerContext()}
      </div>
    </FootnoteProvider>
  );
}
