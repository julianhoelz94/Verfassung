"use client";
import { reconcileCanvasOperations } from "./structured-canvas-reconciliation";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

import type {
  ContentOutline,
  OrderedInlineReference,
  OrderedTextMark,
} from "../../lib/api";

import {
  applyOperation,
  draftDifferences,
  findNode,
  findUnitNode,
  findUnitRoot,
  nodes,
  remapDraftTargets,
  scopedNodes,
  token,
  validateDraft,
  type DraftDifference,
  type DraftEntry,
  type DraftNode,
  type DraftOperation,
  type StructuredPreview,
} from "../../lib/structured-editor";

import {
  SentenceLayoutError,
  WhitespaceOnlyReferenceError,
  type CanvasBlock,
  type CanvasUnit,
} from "../../lib/continuous-editor";

import {
  footnoteCardinality,
  indexDraftFootnoteReferences,
  indexDraftFootnotes,
} from "../../lib/draft-footnotes";

import { useTranslation } from "../components/TranslationProvider";

import { ui, type UiMessage } from "../../lib/messages";

import { useDraftState } from "./EditorDraftState";

import {
  type CanvasController,
  type CanvasMarkerContext,
  type CanvasTextContext,
} from "./ContinuousCanvas";

class LocalizedEditorError extends Error {
  constructor(readonly copy: UiMessage) {
    super(copy.en);
  }
}

export type Snapshot = { roots: DraftNode[]; operations: DraftOperation[] };

export type ReviewDifference = DraftDifference & {
  sourceLink?: string;
  targetLink?: string;
  rootId?: string;
  beforeText?: string;
  afterText?: string;
};

export type NoteDraft = {
  id?: string;
  label: string;
  text: string;
  marks?: OrderedTextMark[];
  anchor?: ReturnType<CanvasController["selection"]>;
};

export type IndexedNote = {
  entry: DraftEntry;
  parentId: string;
  rootId: string;
};

export type StructuredEditorProps = {
  initialTab?: "wiki" | "details";
  wikiPanel?: React.ReactNode;
  detailsPanel?: React.ReactNode;
  review?: ReviewDifference[];
  preview: StructuredPreview;
  outline: ContentOutline;
  rootId: string;
  versionId: string;
  articleId: string;
  constitutionId: string;
  editable: boolean;
  canManageStructure?: boolean;
  scope?: string;
  selectedNode?: string;
  publishedVersionId?: string | null;
  unitMapping?: Record<string, string> | null;
};
/** Owns the editor's existing state, refs and ordered commands without adding a React boundary. */
export function useStructuredEditorModel({
  initialTab,
  wikiPanel,
  detailsPanel,
  review = [],
  preview,
  outline,
  rootId,
  versionId,
  articleId,
  constitutionId,
  editable,
  canManageStructure = false,
  scope: initialScope,
  selectedNode,
  publishedVersionId,
  unitMapping,
}: StructuredEditorProps) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });

  const [sourceRoots, setSourceRoots] = useState(preview.sourceRoots),
    [roots, setRoots] = useState(preview.roots),
    [operations, setOperations] = useState<DraftOperation[]>([]);

  const [history, setHistory] = useState<Snapshot[]>([]),
    [future, setFuture] = useState<Snapshot[]>([]),
    [loadedRootIds, setLoadedRootIds] = useState([rootId]);

  const [canvasReset, setCanvasReset] = useState(0);

  const [overviewRoots, setOverviewRoots] = useState<DraftNode[]>([]),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");

  const [selection, setSelection] = useState(selectedNode ?? rootId),
    [panel, setPanel] = useState(""),
    [mode, setMode] = useState<
      "edit" | "changes" | "preview" | "wiki" | "details"
    >(initialEditorMode(initialTab, wikiPanel, detailsPanel, editable));

  const [noteHistory, setNoteHistory] = useState<NoteDraft[]>([]),
    [noteFuture, setNoteFuture] = useState<NoteDraft[]>([]),
    [insertPosition, setInsertPosition] = useState("after");

  const [noteError, setNoteError] = useState("");

  const [markerContext, setMarkerContext] =
      useState<CanvasMarkerContext | null>(null),
    [activeMarker, setActiveMarker] = useState<CanvasMarkerContext | null>(
      null,
    ),
    [markerMove, setMarkerMove] = useState<{
      noteId: string;
      referenceId: string;
    } | null>(null),
    [onlyUnmarked, setOnlyUnmarked] = useState(false),
    [saveAttempted, setSaveAttempted] = useState(false);

  const [textContext, setTextContext] = useState<
    (CanvasTextContext & { formatting?: boolean }) | null
  >(null);

  const [toolbarTop, setToolbarTop] = useState(0),
    [changeIndex, setChangeIndex] = useState(0);

  const [boundaries, setBoundaries] = useState(false),
    [activeMarks, setActiveMarks] = useState<string[]>([]),
    [noteEdit, setNoteEdit] = useState<NoteDraft | null>(null),
    [referenceTarget, setReferenceTarget] = useState(""),
    [externalUrl, setExternalUrl] = useState("");

  const initialRoot = findNode(preview.roots, rootId) ?? preview.roots[0];

  const [scope, setScope] = useState(
    initialEditorScope(preview, rootId, selectedNode, initialScope),
  );
  const rootRef = useRef<HTMLDivElement>(null),
    loadedIdsRef = useRef(new Set([rootId])),
    rootsRef = useRef(roots),
    operationsRef = useRef(operations),
    historyRef = useRef(history),
    futureRef = useRef(future),
    saving = useRef(false),
    lastTyping = useRef({ key: "", time: 0 });

  useLayoutEffect(() => {
    rootsRef.current = roots;
    operationsRef.current = operations;
    historyRef.current = history;
    futureRef.current = future;
  }, [roots, operations, history, future]);

  const bodyCanvas = useRef<CanvasController | null>(null),
    pendingChangeScroll = useRef<{ id: string; unitId: string } | null>(null);

  const [activeCanvas, setActiveCanvas] = useState<CanvasController | null>(
    null,
  );

  const { setDirty } = useDraftState();

  useEffect(() => {
    setDirty(operations.length > 0 || Boolean(noteEdit));
    return () => setDirty(false);
  }, [operations.length, noteEdit, setDirty]);

  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (saving.current) {
        saving.current = false;
        return;
      }
      if (operations.length || noteEdit) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [operations.length, noteEdit]);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        panel &&
        !rootRef.current
          ?.querySelector("[data-editor-tools]")
          ?.contains(event.target as Node) &&
        !rootRef.current
          ?.querySelector("[data-tool-panel]")
          ?.contains(event.target as Node)
      )
        setPanel("");
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [panel]);

  const allNodes = nodes(roots),
    kindName = (code: string) =>
      outline.kinds.find((kind) => kind.kindCode === code)?.displayLabel ??
      code;

  const selectedUnit =
    findNode(roots, selection) ??
    allNodes.find((node) =>
      node.content.some((entry) => entry.logicalId === selection),
    ) ??
    initialRoot;

  const selectedEntry = selectedUnit.content.find(
    (entry) => entry.logicalId === selection,
  );

  const currentRoot =
    roots.find((root) =>
      nodes([root]).some((node) => node.logicalId === selectedUnit.logicalId),
    ) ?? roots[0];

  const activeLevel = outline.kinds.find(
    (level) => level.kindCode === selectedUnit.kind,
  )!;

  const eligible = (level: ContentOutline["kinds"][number]) =>
    level.segmentation === "sentence" &&
    !level.mayHoldChildren &&
    level.allowedChildKinds.length === 0 &&
    level.labelPolicy !== "required" &&
    level.titlePolicy !== "required";

  const errors = validateDraft(roots, outline, t);

  const loadedIds = new Set(
    nodes([...sourceRoots, ...roots]).flatMap((node) => [
      node.logicalId,
      ...node.content.flatMap((entry) =>
        entry.logicalId ? [entry.logicalId] : [],
      ),
    ]),
  );

  const differences: ReviewDifference[] = [
    ...review.filter((item) => !loadedIds.has(item.logicalId)),
    ...draftDifferences(sourceRoots, roots),
  ];

  const localNotes = indexDraftFootnotes(roots);

  const notes = roots.flatMap((root) =>
    (loadedRootIds.includes(root.logicalId) ||
    localNotes.some((note) => note.rootId === root.logicalId)
      ? localNotes
      : (preview.footnotes ?? [])
    ).filter((note) => note.rootId === root.logicalId),
  );

  const articleNoteIds = new Set(
    nodes([currentRoot]).flatMap((node) =>
      node.content
        .filter((entry) => !entry.node && entry.format !== "footnote")
        .flatMap((entry) =>
          (entry.references ?? []).flatMap((reference) =>
            reference.target.type === "footnote" && reference.target.footnoteId
              ? [reference.target.footnoteId]
              : [],
          ),
        ),
    ),
  );

  const visibleNotes =
    scope === "constitution"
      ? notes
      : notes.filter((note) => articleNoteIds.has(note.entry.logicalId!));

  const completeRoots = new Set([
    ...loadedRootIds,
    ...roots
      .filter((root) => root.content.length > 0)
      .map((root) => root.logicalId),
  ]);

  const noteReferences = [
    ...(preview.footnoteReferences ?? []).filter(
      (reference) => !completeRoots.has(reference.rootId),
    ),
    ...indexDraftFootnoteReferences(roots).filter((reference) =>
      completeRoots.has(reference.rootId),
    ),
  ];

  const markerCount = (id: string) =>
    noteReferences.filter((reference) => reference.noteId === id).length;

  const noteProblems = footnoteCardinality(
    notes.map((note) => ({
      logicalId: note.entry.logicalId!,
      label: note.entry.footnoteLabel ?? "*",
    })),
    noteReferences,
  );

  const noteProblemText = (problem: (typeof noteProblems)[number]) =>
    problem.kind === "missing"
      ? copy(
          "Footnote " + problem.label + " needs a marker before you can save.",
          "Fußnote " +
            problem.label +
            " benötigt vor dem Speichern ein Verweiszeichen.",
        )
      : copy(
          "A marker points to a missing footnote. Remove it or restore its note before saving.",
          "Ein Verweiszeichen verweist auf eine fehlende Fußnote. Entfernen Sie es oder stellen Sie die Fußnote vor dem Speichern wieder her.",
        );

  /** Stores the existing editor scope/selection query without replacing unrelated route state. */
  function remember(view: string, selected: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("scope", view);
    url.searchParams.set("selectedNode", selected);
    window.history.replaceState(null, "", url);
  }

  /** Selects a logical unit and retains the current scope in browser navigation state. */
  function select(id: string) {
    setSelection(id);
    remember(scope, id);
  }

  useEffect(() => {
    const header = document.querySelector(".topbar");
    if (!header) return;
    const measure = () => setToolbarTop(header.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const menu =
      rootRef.current?.querySelector<HTMLElement>("[data-tool-panel]");
    if (!menu) return;
    const viewport = window.visualViewport;
    const measure = () => {
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      menu.style.setProperty(
        "--editor-panel-space",
        Math.max(0, visibleBottom - menu.getBoundingClientRect().top - 12) +
          "px",
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    const toolbar = rootRef.current?.querySelector("[data-editor-tools]");
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : undefined;
    if (toolbar) observer?.observe(toolbar);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [panel, mode, toolbarTop]);

  /** Updates synchronous roots/operations refs before scheduling React state, preserving subsequent command reads. */
  function install(nextRoots: DraftNode[], nextOperations: DraftOperation[]) {
    rootsRef.current = nextRoots;
    operationsRef.current = nextOperations;
    setRoots(nextRoots);
    setOperations(nextOperations);
  }

  /** Builds atomically against current refs; coalesces replacements, groups typing history and retains failure reset behavior. */
  function transaction(
    build: (
      emit: (operation: Omit<DraftOperation, "id">) => DraftOperation,
      current: () => DraftNode[],
    ) => void,
    grouping = "",
  ) {
    const before = {
      roots: rootsRef.current,
      operations: operationsRef.current,
    };
    let nextRoots = before.roots,
      nextOperations = before.operations;
    try {
      build(
        (op) => {
          const previous = nextOperations.at(-1),
            coalesce =
              previous &&
              previous.targetId === op.targetId &&
              previous.type === op.type &&
              ["replace_text", "set_metadata"].includes(op.type);
          const command = coalesce
            ? {
                ...op,
                id: previous.id,
                expectedRevisionId: previous.expectedRevisionId,
              }
            : { ...op, id: crypto.randomUUID() };
          nextRoots = applyOperation(nextRoots, command);
          nextOperations = coalesce
            ? [...nextOperations.slice(0, -1), command]
            : [...nextOperations, command];
          return command;
        },
        () => nextRoots,
      );
      if (JSON.stringify(nextRoots) === JSON.stringify(before.roots))
        return true;
      // Transaction callbacks run on input, never during rendering; the clock groups typing history.
      const now = Date.now(),
        grouped =
          grouping &&
          lastTyping.current.key === grouping &&
          now - lastTyping.current.time < 900;
      const nextHistory = grouped
        ? historyRef.current
        : [...historyRef.current, before].slice(-100);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      futureRef.current = [];
      setFuture([]);
      lastTyping.current = { key: grouping, time: now };
      for (const operation of nextOperations)
        if (operation.type === "insert_root" && operation.node)
          loadedIdsRef.current.add(operation.node.logicalId);
      setLoadedRootIds([...loadedIdsRef.current]);
      install(nextRoots, nextOperations);
      setMessage(t(ui.state.unsavedChanges));
      return true;
    } catch (error) {
      setCanvasReset((current) => current + 1);
      setMessage(
        error instanceof WhitespaceOnlyReferenceError
          ? copy(
              "Move the link onto sentence text before removing its surrounding spaces.",
              "Verschieben Sie den Link auf Satztext, bevor Sie die umgebenden Leerzeichen entfernen.",
            )
          : error instanceof SentenceLayoutError
            ? copy(
                "At most 16 line breaks are allowed between sentences.",
                "Zwischen Sätzen sind höchstens 16 Zeilenumbrüche erlaubt.",
              )
            : t(ui.state.invalidChange),
      );
      return false;
    }
  }

  /** Applies one command through the same transaction/history boundary as multi-step edits. */
  function change(operation: Omit<DraftOperation, "id">) {
    transaction((emit) => {
      emit(operation);
    });
  }

  /** Closes note-local state and restores the body canvas only while that controller remains alive. */
  function closeNoteEditor() {
    setNoteEdit(null);
    setNoteError("");
    const body = bodyCanvas.current?.isAlive() ? bodyCanvas.current : null;
    setActiveCanvas(body);
    requestAnimationFrame(() => body?.focus());
  }

  /** Tracks note-local history separately from constitution operations until Apply is accepted. */
  function updateNoteDraft(next: NoteDraft) {
    if (noteEdit)
      setNoteHistory((current) => [...current, noteEdit].slice(-100));
    setNoteFuture([]);
    setNoteEdit(next);
  }

  /** Preserves scope expansion, note-local history reset and next-frame autofocus when opening a note. */
  function openNoteEditor(next: NoteDraft) {
    if (
      next.id &&
      scope !== "constitution" &&
      !visibleNotes.some((note) => note.entry.logicalId === next.id)
    ) {
      setScope("constitution");
      remember("constitution", selection);
    }
    setNoteHistory([]);
    setNoteFuture([]);
    setNoteError("");
    setActiveCanvas(null);
    setActiveMarks([]);
    setNoteEdit(next);
    requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector<HTMLElement>(
          (next.id ? "#editor-fn-" + next.id : "#editor-new-note") +
            " [role=textbox]",
        )
        ?.focus({ preventScroll: true }),
    );
  }

  /** Keeps separate note/body undo-redo histories and restores the original typing-group and focus behavior. */
  function travel(redo = false) {
    if (noteEdit) {
      const stack = redo ? noteFuture : noteHistory,
        previous = stack.at(-1);
      if (!previous) return;
      setCanvasReset((current) => current + 1);
      if (redo) {
        setNoteFuture(stack.slice(0, -1));
        setNoteHistory((current) => [...current, noteEdit]);
      } else {
        setNoteHistory(stack.slice(0, -1));
        setNoteFuture((current) => [...current, noteEdit]);
      }
      setNoteEdit(previous);
      return;
    }
    const stack = redo ? futureRef.current : historyRef.current,
      previous = stack.at(-1);
    if (!previous) return;
    setCanvasReset((current) => current + 1);
    const now = { roots: rootsRef.current, operations: operationsRef.current };
    if (redo) {
      futureRef.current = stack.slice(0, -1);
      historyRef.current = [...historyRef.current, now];
    } else {
      historyRef.current = stack.slice(0, -1);
      futureRef.current = [...futureRef.current, now];
    }
    setHistory(historyRef.current);
    setFuture(futureRef.current);
    install(previous.roots, previous.operations);
    lastTyping.current = { key: "", time: 0 };
    setMessage(
      copy(
        redo ? "Last change restored." : "Last change undone.",
        redo
          ? "Letzte Änderung wiederhergestellt."
          : "Letzte Änderung rückgängig gemacht.",
      ),
    );
    requestAnimationFrame(() => activeCanvas?.focus());
  }

  /** Loads only the requested projection and rejects generation or settings changes before using its data. */
  async function fetchView(
    view: string,
    targetRoot?: string,
  ): Promise<StructuredPreview> {
    const params = new URLSearchParams({
      sessionId: preview.sessionId,
      scope: view,
    });
    if (targetRoot) params.set("rootId", targetRoot);
    const response = await fetchWithTimeout("/editor/view?" + params, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new LocalizedEditorError(ui.editorDefaults.viewRetry);
    const loaded: StructuredPreview = await response.json();
    if (
      loaded.generation !== preview.generation ||
      loaded.settingsRevisionId !== preview.settingsRevisionId
    )
      throw new LocalizedEditorError(ui.editorDefaults.sessionChanged);
    return loaded;
  }

  /** Hydrates one missing root using current refs after the asynchronous read, retaining local edits and histories. */
  async function ensureRoot(id: string): Promise<DraftNode[]> {
    if (loadedIdsRef.current.has(id)) return rootsRef.current;
    const loaded = await fetchView("constitution", id),
      serverRoot = loaded.roots.find((root) => root.logicalId === id),
      original = loaded.sourceRoots.find((root) => root.logicalId === id);
    if (!serverRoot)
      throw new LocalizedEditorError(ui.editorDefaults.viewRetry);
    const hydrate = (operations: DraftOperation[]) =>
      operations.reduce(
        (roots, operation) => remapDraftTargets(roots, operation),
        [serverRoot],
      )[0];
    const replace = (current: DraftNode[], operations: DraftOperation[]) =>
        current.map((root) =>
          root.logicalId === id ? hydrate(operations) : root,
        ),
      next = replace(rootsRef.current, operationsRef.current);
    install(next, operationsRef.current);
    setSourceRoots((current) =>
      current.map((root) =>
        root.logicalId === id && original ? original : root,
      ),
    );
    historyRef.current = historyRef.current.map((snapshot) => ({
      ...snapshot,
      roots: replace(snapshot.roots, snapshot.operations),
    }));
    futureRef.current = futureRef.current.map((snapshot) => ({
      ...snapshot,
      roots: replace(snapshot.roots, snapshot.operations),
    }));
    setHistory(historyRef.current);
    setFuture(futureRef.current);
    loadedIdsRef.current.add(id);
    setLoadedRootIds([...loadedIdsRef.current]);
    return next;
  }

  /** Hydrates the full pinned preview while replaying existing operations into every history snapshot. */
  async function showPreview() {
    setLoading(true);
    setPanel("");
    try {
      const response = await fetchWithTimeout(
        "/editor/view?" +
          new URLSearchParams({
            sessionId: preview.sessionId,
            scope: "constitution",
            includeBody: "true",
          }),
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new LocalizedEditorError(ui.editorDefaults.viewRetry);
      const loaded: StructuredPreview = await response.json();
      if (
        loaded.generation !== preview.generation ||
        loaded.settingsRevisionId !== preview.settingsRevisionId
      )
        throw new LocalizedEditorError(ui.editorDefaults.sessionChanged);
      const fresh = new Map(
        loaded.roots
          .filter((root) => !loadedIdsRef.current.has(root.logicalId))
          .map((root) => [root.logicalId, root]),
      );
      const hydrate = (current: DraftNode[], operations: DraftOperation[]) =>
        current.map((root) =>
          fresh.has(root.logicalId)
            ? operations.reduce(
                (roots, operation) => remapDraftTargets(roots, operation),
                [fresh.get(root.logicalId)!],
              )[0]
            : root,
        );
      install(
        hydrate(rootsRef.current, operationsRef.current),
        operationsRef.current,
      );
      setSourceRoots((current) =>
        current.map((root) =>
          fresh.has(root.logicalId)
            ? (loaded.sourceRoots.find(
                (original) => original.logicalId === root.logicalId,
              ) ?? root)
            : root,
        ),
      );
      historyRef.current = historyRef.current.map((snapshot) => ({
        ...snapshot,
        roots: hydrate(snapshot.roots, snapshot.operations),
      }));
      futureRef.current = futureRef.current.map((snapshot) => ({
        ...snapshot,
        roots: hydrate(snapshot.roots, snapshot.operations),
      }));
      setHistory(historyRef.current);
      setFuture(futureRef.current);
      loaded.roots.forEach((root) => loadedIdsRef.current.add(root.logicalId));
      setLoadedRootIds([...loadedIdsRef.current]);
      setScope("constitution");
      setMode("preview");
      remember("constitution", selection);
    } catch (error) {
      setMessage(
        t(
          error instanceof LocalizedEditorError
            ? error.copy
            : ui.state.viewLoadFailed,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Keeps the existing overview fetch, loading/error feedback and selected scope update order. */
  async function changeScope(view: string) {
    setLoading(true);
    setPanel("");
    try {
      if (view === "constitution") {
        const loaded = await fetchView(view);
        setOverviewRoots(loaded.roots);
      }
      setScope(view);
      remember(view, selection);
    } catch (error) {
      setMessage(
        t(
          error instanceof LocalizedEditorError
            ? error.copy
            : ui.state.viewLoadFailed,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (scope === "constitution") {
      queueMicrotask(() => {
        void changeScope(scope);
      });
    } /* Initial pinned view only. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Loads a selected root before changing the active scope, selection and edit mode. */
  async function navigateRoot(id: string) {
    setPanel("");
    setLoading(true);
    try {
      const loaded = await ensureRoot(id),
        root = loaded.find((root) => root.logicalId === id)!;
      const nextScope = scope === "constitution" ? "constitution" : root.kind;
      setScope(nextScope);
      select(id);
      remember(nextScope, id);
      setMode("edit");
    } catch (error) {
      setMessage(
        t(
          error instanceof LocalizedEditorError
            ? error.copy
            : ui.state.viewLoadFailed,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Creates the configured first-child chain while rejecting cyclic or missing outline levels. */
  function createNode(code: string, ancestors = new Set<string>()): DraftNode {
    const level = outline.kinds.find((level) => level.kindCode === code);
    if (!level || ancestors.has(code)) throw new Error("Invalid outline");
    return {
      logicalId: crypto.randomUUID(),
      kind: code,
      label:
        level.labelPolicy === "required" ? t(ui.editorDefaults.newLabel) : null,
      title:
        level.titlePolicy === "required" ? t(ui.editorDefaults.newTitle) : null,
      content: level.allowedChildKinds[0]
        ? [
            {
              type: "child",
              node: createNode(
                level.allowedChildKinds[0],
                new Set([...ancestors, code]),
              ),
            },
          ]
        : [{ type: "text", logicalId: crypto.randomUUID(), text: "" }],
    };
  }

  /** Runs canvas planning inside one atomic transaction and projects the accepted rich text back to the canvas. */
  function reconcile(
    units: CanvasUnit[],
    blocks: CanvasBlock[],
    parentId: string | null,
    grouping: string,
    entriesOnly = false,
  ) {
    const accepted = transaction(
      (emit, current) =>
        reconcileCanvasOperations({
          units,
          blocks,
          parentId,
          entriesOnly,
          outline,
          eligible,
          emit,
          current,
        }),
      grouping,
    );
    if (!accepted) return false;
    const entries = new Map(
      nodes(rootsRef.current).flatMap((node) =>
        node.content.flatMap((entry) =>
          entry.logicalId ? [[entry.logicalId, entry] as const] : [],
        ),
      ),
    );
    return blocks.map((block) => {
      const entry = entries.get(block.textId)!;
      return {
        ...block,
        text: entry.text ?? "",
        marks: entry.marks ?? [],
        references: entry.references ?? [],
        lineBreaksBefore: entry.lineBreaksBefore ?? 0,
      };
    });
  }

  /** Preserves the body-controller identity while preventing constitution activation during note editing. */
  function activate(controller: CanvasController, id: string) {
    if (noteEdit) return;
    bodyCanvas.current = controller;
    setActiveCanvas(controller);
    setActiveMarks(controller.activeMarks());
    select(id);
  }

  /** Loads globally indexed roots before resolving exactly one marker; duplicate identities retain the draft. */
  async function locateMarker(noteId: string, referenceId: string) {
    const indexed = noteReferences.filter((reference) =>
      reference.referenceId
        ? reference.referenceId === referenceId
        : reference.noteId === noteId,
    );
    for (const id of new Set(indexed.map((reference) => reference.rootId)))
      await ensureRoot(id);
    const matches = nodes(rootsRef.current).flatMap((owner) =>
      owner.content.flatMap((entry) =>
        (entry.references ?? [])
          .filter((reference) => reference.logicalId === referenceId)
          .map((reference) => ({ entry, reference })),
      ),
    );
    if (matches.length > 1)
      throw new LocalizedEditorError({
        en: "This marker ID is used more than once. Correct the duplicate IDs before moving or removing a marker. Your draft is retained.",
        de: "Diese Verweiszeichen-ID wird mehrfach verwendet. Korrigieren Sie die doppelten IDs, bevor Sie ein Zeichen verschieben oder entfernen. Ihr Entwurf bleibt erhalten.",
      });
    const found = matches[0];
    if (
      found?.reference.target.type === "footnote" &&
      found.reference.target.footnoteId === noteId
    )
      return found;
    throw new Error("The marker is no longer present.");
  }

  /** Resolves the existing marker before entering move mode or showing localized recovery feedback. */
  async function beginMarkerMove(noteId: string, referenceId: string) {
    setLoading(true);
    try {
      const found = await locateMarker(noteId, referenceId);
      setMarkerMove({ noteId, referenceId: found.reference.logicalId });
      setPanel("");
      setMessage(
        copy(
          "Choose the new position in the text, then select Place marker.",
          "Wählen Sie die neue Textposition und anschließend „Verweiszeichen platzieren“.",
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof LocalizedEditorError
          ? t(error.copy)
          : copy(
              "The marker could not be loaded. Your draft is retained.",
              "Das Verweiszeichen konnte nicht geladen werden. Ihr Entwurf bleibt erhalten.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Removes only the selected marker and retains the shared note and its other references. */
  async function removeMarker(noteId: string, referenceId: string) {
    setLoading(true);
    try {
      const found = await locateMarker(noteId, referenceId);
      updateEntry(found.entry, {
        references: found.entry.references?.filter(
          (reference) => reference.logicalId !== referenceId,
        ),
      });
      setActiveMarker(null);
      if (markerMove?.referenceId === referenceId) setMarkerMove(null);
      setMessage(
        markerCount(noteId) > 1
          ? copy(
              "Marker removed. The footnote and its other markers are retained.",
              "Verweiszeichen entfernt. Die Fußnote und ihre anderen Verweiszeichen bleiben erhalten.",
            )
          : copy(
              "Marker removed. The footnote is retained; add a marker before saving.",
              "Verweiszeichen entfernt. Die Fußnote bleibt erhalten; ergänzen Sie vor dem Speichern ein Verweiszeichen.",
            ),
      );
    } catch (error) {
      setMessage(
        error instanceof LocalizedEditorError
          ? t(error.copy)
          : copy(
              "The marker could not be removed. Your draft is retained.",
              "Das Verweiszeichen konnte nicht entfernt werden. Ihr Entwurf bleibt erhalten.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Moves a resolved marker atomically to the current valid body anchor, preserving reference ordering. */
  async function placeMarker() {
    if (!markerMove || !activeCanvas?.isAlive()) return;
    const anchor = activeCanvas.endAnchor();
    setLoading(true);
    try {
      const source = await locateMarker(
          markerMove.noteId,
          markerMove.referenceId,
        ),
        target = nodes(rootsRef.current)
          .flatMap((node) => node.content)
          .find((entry) => entry.logicalId === anchor.textId);
      if (
        !target ||
        target.format === "footnote" ||
        target.format === "table" ||
        anchor.end < 0 ||
        anchor.end > (target.text ?? "").length
      ) {
        setMessage(
          copy(
            "Choose a position in the constitution text.",
            "Wählen Sie eine Position im Verfassungstext.",
          ),
        );
        return;
      }
      if (
        target.references?.some(
          (reference) =>
            reference.logicalId !== markerMove.referenceId &&
            reference.start < anchor.end &&
            reference.end > anchor.end,
        )
      ) {
        setMessage(
          copy(
            "Place the footnote before or after the linked text.",
            "Setzen Sie die Fußnote vor oder hinter den verlinkten Text.",
          ),
        );
        return;
      }
      const moved = { ...source.reference, start: anchor.end, end: anchor.end };
      const accepted = transaction((emit, current) => {
        const replace = (
          entry: DraftEntry,
          references: OrderedInlineReference[],
        ) =>
          emit({
            type: "replace_text",
            targetId: entry.logicalId!,
            expectedRevisionId: token(entry),
            text: entry.text ?? "",
            format: entry.format ?? "plain",
            table: entry.table,
            footnoteLabel: entry.footnoteLabel,
            marks: entry.marks ?? [],
            lineBreaksBefore: entry.lineBreaksBefore ?? 0,
            annotation: entry.annotation,
            references: references.sort(
              (a, b) => a.start - b.start || a.end - b.end,
            ),
          });
        if (source.entry.logicalId !== target.logicalId)
          replace(
            source.entry,
            (source.entry.references ?? []).filter(
              (reference) => reference.logicalId !== markerMove.referenceId,
            ),
          );
        const destination = nodes(current())
          .flatMap((node) => node.content)
          .find((entry) => entry.logicalId === target.logicalId)!;
        replace(destination, [
          ...(destination.references ?? []).filter(
            (reference) => reference.logicalId !== markerMove.referenceId,
          ),
          moved,
        ]);
      });
      if (accepted) {
        setMarkerMove(null);
        setActiveMarker(null);
        setMessage(copy("Marker moved.", "Verweiszeichen verschoben."));
        requestAnimationFrame(() => activeCanvas.focus());
      }
    } catch (error) {
      setMessage(
        error instanceof LocalizedEditorError
          ? t(error.copy)
          : copy(
              "The marker could not be moved. Its original position is retained.",
              "Das Verweiszeichen konnte nicht verschoben werden. Seine ursprüngliche Position bleibt erhalten.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Compares the original rich-field defaults before emitting a replacement operation. */
  function updateEntry(
    entry: DraftEntry,
    patch: Partial<
      Pick<
        DraftEntry,
        | "text"
        | "format"
        | "table"
        | "footnoteLabel"
        | "annotation"
        | "references"
        | "marks"
        | "lineBreaksBefore"
      >
    >,
  ) {
    const fields = (value: DraftEntry) => ({
      text: value.text ?? "",
      format: value.format ?? "plain",
      table: value.table ?? null,
      footnoteLabel: value.footnoteLabel ?? null,
      annotation: value.annotation ?? null,
      references: value.references ?? [],
      marks: value.marks ?? [],
      lineBreaksBefore: value.lineBreaksBefore ?? 0,
    });
    if (
      JSON.stringify(fields(entry)) ===
      JSON.stringify(fields({ ...entry, ...patch }))
    )
      return;
    change({
      type: "replace_text",
      targetId: entry.logicalId!,
      expectedRevisionId: token(entry),
      format: entry.format ?? "plain",
      table: entry.table,
      footnoteLabel: entry.footnoteLabel,
      annotation: entry.annotation,
      references: entry.references ?? [],
      marks: entry.marks ?? [],
      lineBreaksBefore: entry.lineBreaksBefore ?? 0,
      ...patch,
      text: patch.text ?? entry.text ?? "",
    });
  }

  /** Resolves the final constitution leaf before inserting an endnote, including lazily loaded roots. */
  async function noteDestination(): Promise<{
    parent: DraftNode;
    position: number;
  }> {
    const loaded = await ensureRoot(rootsRef.current.at(-1)!.logicalId),
      last = loaded.at(-1)!;
    function endContainer(node: DraftNode): DraftNode | undefined {
      if (
        outline.kinds.find((level) => level.kindCode === node.kind)?.mayHoldText
      )
        return node;
      const child = node.content.at(-1)?.node;
      return child ? endContainer(child) : undefined;
    }
    const parent = endContainer(last);
    if (!parent)
      throw new LocalizedEditorError({
        en: "Add a text unit to the final section before adding footnotes. Your note is retained.",
        de: "Fügen Sie dem letzten Abschnitt zuerst eine Texteinheit hinzu. Ihre Fußnote bleibt erhalten.",
      });
    return { parent, position: parent.content.length };
  }

  /** Applies note content/markers through the existing atomic command order and keeps recovery feedback. */
  async function applyNote() {
    if (!noteEdit?.label.trim() || !noteEdit.text.trim()) {
      setMessage(
        copy(
          "Enter a label and footnote text.",
          "Geben Sie eine Bezeichnung und den Fußnotentext ein.",
        ),
      );
      return;
    }
    setLoading(true);
    try {
      if (noteEdit.id) {
        const indexed = notes.find(
          (note) => note.entry.logicalId === noteEdit.id,
        )!;
        await ensureRoot(indexed.rootId);
        const entry = nodes(rootsRef.current)
          .flatMap((node) => node.content)
          .find((entry) => entry.logicalId === noteEdit.id)!;
        updateEntry(entry, {
          text: noteEdit.text,
          footnoteLabel: noteEdit.label,
          marks: noteEdit.marks ?? [],
        });
      } else {
        const anchor = noteEdit.anchor,
          source =
            anchor &&
            nodes(rootsRef.current)
              .flatMap((node) => node.content)
              .find((entry) => entry.logicalId === anchor.textId);
        if (
          anchor &&
          source?.references?.some(
            (reference) =>
              reference.start < anchor.end && reference.end > anchor.end,
          )
        ) {
          setNoteError(
            copy(
              "Place the footnote before or after the linked text.",
              "Setzen Sie die Fußnote vor oder hinter den verlinkten Text.",
            ),
          );
          return;
        }
        const destination = await noteDestination(),
          id = crypto.randomUUID();
        transaction((emit, current) => {
          emit({
            type: "insert_text",
            targetId: destination.parent.logicalId,
            expectedRevisionId: token(destination.parent),
            position: destination.position,
            parts: [
              {
                logicalId: id,
                text: noteEdit.text,
                format: "footnote",
                footnoteLabel: noteEdit.label,
                marks: noteEdit.marks ?? [],
              },
            ],
          });
          if (anchor) {
            const entry = nodes(current())
              .flatMap((node) => node.content)
              .find((entry) => entry.logicalId === anchor.textId);
            if (entry)
              emit({
                type: "replace_text",
                targetId: entry.logicalId!,
                expectedRevisionId: token(entry),
                text: entry.text ?? "",
                format: "plain",
                marks: entry.marks ?? [],
                lineBreaksBefore: entry.lineBreaksBefore ?? 0,
                references: [
                  ...(entry.references ?? []),
                  {
                    logicalId: crypto.randomUUID(),
                    start: anchor.end,
                    end: anchor.end,
                    target: { type: "footnote" as const, footnoteId: id },
                  },
                ].sort((a, b) => a.start - b.start || a.end - b.end),
              });
          }
        });
      }
      closeNoteEditor();
      setPanel("");
    } catch (error) {
      if (error instanceof LocalizedEditorError) setNoteError(t(error.copy));
      else
        setMessage(
          copy(
            "The endnotes could not be loaded. Your text is retained.",
            "Die Fußnoten konnten nicht geladen werden. Ihr Text bleibt erhalten.",
          ),
        );
    } finally {
      setLoading(false);
    }
  }

  /** Captures a live body anchor and the next available literal label before opening note-local editing. */
  function newNote() {
    const anchor = activeCanvas?.endAnchor();
    if (
      !anchor ||
      !nodes(rootsRef.current)
        .flatMap((node) => node.content)
        .some(
          (entry) =>
            entry.logicalId === anchor.textId && entry.format !== "footnote",
        )
    ) {
      setMessage(
        copy(
          "Place the cursor in the constitution text first.",
          "Setzen Sie zuerst den Cursor in den Verfassungstext.",
        ),
      );
      return;
    }
    setNoteError("");
    const labels = new Set(notes.map((note) => note.entry.footnoteLabel));
    let number = 1;
    while (labels.has(String(number))) number++;
    openNoteEditor({ label: String(number), text: "", anchor });
    setPanel("");
    requestAnimationFrame(() =>
      document
        .getElementById("editor-new-note")
        ?.scrollIntoView({ block: "nearest" }),
    );
  }

  /** Shows the full endnotes scope before scrolling through the footnote provider callback. */
  async function navigateNote(id: string) {
    if (!notes.some((note) => note.entry.logicalId === id)) return;
    setMode("edit");
    setScope("constitution");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }

  /** Hydrates cross-root reference owners, removes their references and then deletes the note. */
  async function removeNote(indexed: IndexedNote) {
    setLoading(true);
    try {
      const owners = new Set([
        indexed.rootId,
        ...(preview.footnoteReferences ?? [])
          .filter((reference) => reference.noteId === indexed.entry.logicalId)
          .map((reference) => reference.rootId),
      ]);
      for (const id of owners) await ensureRoot(id);
      transaction((emit, current) => {
        for (const entry of nodes(current()).flatMap((node) => node.content)) {
          const references = entry.references?.filter(
            (reference) =>
              reference.target.footnoteId !== indexed.entry.logicalId,
          );
          if (references?.length !== entry.references?.length)
            emit({
              type: "replace_text",
              targetId: entry.logicalId!,
              expectedRevisionId: token(entry),
              text: entry.text ?? "",
              format: entry.format ?? "plain",
              marks: entry.marks ?? [],
              references,
            });
        }
        const entry = nodes(current())
          .flatMap((node) => node.content)
          .find((entry) => entry.logicalId === indexed.entry.logicalId)!;
        emit({
          type: "remove",
          targetId: entry.logicalId!,
          expectedRevisionId: token(entry),
        });
      });
      closeNoteEditor();
    } catch {
      setMessage(
        copy(
          "The note references could not be loaded. Nothing was removed.",
          "Die Fußnotenverweise konnten nicht geladen werden. Es wurde nichts entfernt.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Moves note bodies to the complete document end while preserving local edits and note order. */
  async function normalizeEndnotes() {
    setLoading(true);
    try {
      for (const note of notes) await ensureRoot(note.rootId);
      const destination = await noteDestination();
      transaction((emit, current) => {
        for (const indexed of notes) {
          const parent = findNode(current(), destination.parent.logicalId)!,
            owner = nodes(current()).find((node) =>
              node.content.some(
                (entry) => entry.logicalId === indexed.entry.logicalId,
              ),
            )!,
            entry = owner.content.find(
              (entry) => entry.logicalId === indexed.entry.logicalId,
            )!;
          const position =
            parent.content.length -
            (parent.logicalId === owner.logicalId ? 1 : 0);
          if (
            parent.logicalId !== owner.logicalId ||
            owner.content.indexOf(entry) !== position
          )
            emit({
              type: "move",
              targetId: entry.logicalId!,
              expectedRevisionId: token(entry),
              destinationParentId: parent.logicalId,
              destinationRevisionId: token(parent),
              position,
            });
        }
      });
    } catch {
      setMessage(
        copy(
          "The endnotes could not be moved. Your draft is retained.",
          "Die Fußnoten konnten nicht verschoben werden. Ihr Entwurf bleibt erhalten.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Moves the selected entry or root within its current permitted non-endnote boundary. */
  function moveSelected(delta: number) {
    const parent = allNodes.find((node) =>
        node.content.some(
          (entry) =>
            entry.node?.logicalId === selectedUnit.logicalId ||
            entry.logicalId === selection,
        ),
      ),
      entry = parent?.content.find(
        (entry) =>
          entry.node?.logicalId === selectedUnit.logicalId ||
          entry.logicalId === selection,
      );
    if (parent && entry) {
      const at = parent.content.indexOf(entry),
        position = at + delta;
      if (
        position >= 0 &&
        position < parent.content.length &&
        parent.content[position].format !== "footnote"
      )
        change({
          type: "move",
          targetId: entry.node?.logicalId ?? entry.logicalId!,
          expectedRevisionId: token(entry.node ?? entry),
          destinationParentId: parent.logicalId,
          destinationRevisionId: token(parent),
          position,
        });
    } else if (roots.indexOf(selectedUnit) >= 0)
      change({
        type: "move_root",
        targetId: selectedUnit.logicalId,
        expectedRevisionId: token(selectedUnit),
        position: Math.max(
          0,
          Math.min(roots.length - 1, roots.indexOf(selectedUnit) + delta),
        ),
      });
  }

  /** Uses the selected insertion position and configured metadata defaults for new units or text/table entries. */
  function insert(kind?: string, format: "plain" | "table" = "plain") {
    const parent = selectedUnit,
      end = parent.content.findIndex((entry) => entry.format === "footnote"),
      limit = end < 0 ? parent.content.length : end,
      selectedAt = selectedEntry ? parent.content.indexOf(selectedEntry) : -1,
      position =
        insertPosition === "start"
          ? 0
          : insertPosition === "end" || selectedAt < 0
            ? limit
            : Math.min(
                limit,
                selectedAt + (insertPosition === "after" ? 1 : 0),
              );
    if (kind)
      change({
        type: "insert_child",
        targetId: parent.logicalId,
        expectedRevisionId: token(parent),
        position,
        node: createNode(kind),
      });
    else if (activeLevel.mayHoldText) {
      const table =
        format === "table"
          ? {
              caption: "",
              rows: [
                {
                  logicalId: crypto.randomUUID(),
                  cells: [
                    {
                      logicalId: crypto.randomUUID(),
                      text: t(ui.editorDefaults.heading),
                      header: true,
                    },
                  ],
                },
                {
                  logicalId: crypto.randomUUID(),
                  cells: [
                    {
                      logicalId: crypto.randomUUID(),
                      text: t(ui.editorDefaults.value),
                    },
                  ],
                },
              ],
            }
          : undefined;
      change({
        type: "insert_text",
        targetId: parent.logicalId,
        expectedRevisionId: token(parent),
        position,
        parts: [
          {
            logicalId: crypto.randomUUID(),
            text: table
              ? table.rows.map((row) => row.cells[0].text).join("\n")
              : "",
            format,
            table,
          },
        ],
      });
    }
    setPanel("");
  }

  /** Adds a reference through the live canvas and preserves the existing overlap/selection feedback. */
  function link(target: OrderedInlineReference["target"]) {
    if (!activeCanvas?.isAlive()) {
      setMessage(
        copy(
          "Place the cursor in the constitution text first.",
          "Setzen Sie zuerst den Cursor in den Verfassungstext.",
        ),
      );
      return;
    }
    if (!activeCanvas.addReference(target)) {
      setMessage(
        target.type === "footnote"
          ? copy(
              "Place the footnote before or after the linked text.",
              "Setzen Sie die Fußnote vor oder hinter den verlinkten Text.",
            )
          : copy(
              "Select text that is not already linked.",
              "Wählen Sie Text aus, der noch nicht verlinkt ist.",
            ),
      );
      return;
    }
    setPanel("");
  }

  const scopeLevel = outline.kinds.find((level) => level.kindCode === scope),
    leafScope =
      scopeLevel &&
      !scopeLevel.mayHoldChildren &&
      !scopeLevel.allowedChildKinds.length;

  const focusedNodes =
      scope === "constitution"
        ? roots
        : leafScope
          ? (currentRoot.kind === scope
              ? eligible(scopeLevel!)
                ? roots
                : [currentRoot]
              : nodes([currentRoot])
            ).filter((node) => node.kind === scope)
          : scopedNodes(roots, currentRoot.logicalId, selection, scope),
    rootKinds = outline.kinds.some((kind) => kind.root)
      ? outline.kinds.filter((kind) => kind.root)
      : outline.kinds.slice(0, 1);

  useEffect(() => {
    const pending = pendingChangeScroll.current;
    if (!pending) return;
    const target = rootRef.current?.querySelector(
      '[data-editor-entry="' +
        pending.id +
        '"], [data-unit="' +
        pending.id +
        '"], [data-editor-unit="' +
        pending.unitId +
        '"]',
    );
    if (target) {
      pendingChangeScroll.current = null;
      target.scrollIntoView({ block: "center" });
    }
  });

  /** Loads a difference owner before restoring selection, edit scope and the deferred scroll target. */
  async function navigateDifference(index: number) {
    const difference = differences[index];
    if (!difference) return;
    setChangeIndex(index);
    setLoading(true);
    try {
      const ownerId =
        difference.rootId ??
        findUnitRoot(roots, difference.logicalId)?.logicalId;
      const current = ownerId ? await ensureRoot(ownerId) : rootsRef.current,
        owner = ownerId
          ? current.find((root) => root.logicalId === ownerId)
          : undefined;
      const unit = findUnitNode(current, difference.logicalId);
      select(difference.logicalId);
      if (!unit) {
        setMode("changes");
        setMessage(
          copy(
            "This unit was removed. Its original wording and source snapshot are shown in Changes.",
            "Diese Einheit wurde entfernt. Der ursprüngliche Wortlaut und der Ausgangsstand stehen unter Änderungen.",
          ),
        );
        return;
      }
      pendingChangeScroll.current = {
        id: difference.logicalId,
        unitId: unit.logicalId,
      };
      const nextScope =
        scope === "constitution" ? scope : (owner?.kind ?? unit.kind);
      setScope(nextScope);
      remember(nextScope, difference.logicalId);
      setMode("edit");
    } catch (error) {
      setMessage(
        t(
          error instanceof LocalizedEditorError
            ? error.copy
            : ui.state.viewLoadFailed,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  /** Builds snapshot-pinned source/target passage links from logical-to-occurrence mappings. */
  function differenceReference(id: string, target: boolean) {
    const list = target ? roots : sourceRoots,
      owner = findUnitRoot(list, id);
    const unit =
      owner &&
      (findNode([owner], id) ??
        nodes([owner])
          .flatMap((node) => node.content)
          .find((entry) => entry.logicalId === id));
    const version = target ? publishedVersionId : preview.sourceVersionId,
      rootOccurrence = target
        ? owner && unitMapping?.[owner.logicalId]
        : owner?.occurrenceId,
      occurrence = target ? unitMapping?.[id] : unit?.occurrenceId;
    return version && rootOccurrence
      ? "/versions/" +
          encodeURIComponent(version) +
          "/units/" +
          encodeURIComponent(rootOccurrence) +
          (occurrence ? "?occurrenceId=" + encodeURIComponent(occurrence) : "")
      : undefined;
  }
  return {
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
  };
}
export type StructuredEditorModel = ReturnType<typeof useStructuredEditorModel>;

/** Preserves tab precedence and read-only default mode when the workspace first mounts. */
function initialEditorMode(
  initialTab: StructuredEditorProps["initialTab"],
  wikiPanel: React.ReactNode,
  detailsPanel: React.ReactNode,
  editable: boolean,
): "edit" | "changes" | "preview" | "wiki" | "details" {
  return initialTab === "wiki" && wikiPanel
    ? "wiki"
    : initialTab === "details" && detailsPanel
      ? "details"
      : editable
        ? "edit"
        : "changes";
}
/** Only an inherited scope relevant to the selected root is retained, apart from constitution overview. */
function initialEditorScope(
  preview: StructuredPreview,
  rootId: string,
  selectedNode: string | undefined,
  initialScope: string | undefined,
): string {
  const initialRoot = findNode(preview.roots, rootId) ?? preview.roots[0];
  const defaultScope = scopedNodes(
    preview.roots,
    rootId,
    selectedNode ?? rootId,
    "article",
  ).length
    ? "article"
    : initialRoot.kind;
  return initialScope === "constitution" ||
    (initialScope &&
      scopedNodes(preview.roots, rootId, selectedNode ?? rootId, initialScope)
        .length)
    ? initialScope!
    : defaultScope;
}
