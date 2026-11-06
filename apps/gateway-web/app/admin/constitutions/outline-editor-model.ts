import type { OutlineKindWrite, ContentOutline } from "../../../lib/api";
import { ui, type UiMessage } from "../../../lib/messages";
import { structureUi } from "../../../lib/structure-workspace";

/** A controlled outline level, including UI-only identity and raw delimiter input. */
export type OutlineLayer = OutlineKindWrite & {
  existing?: boolean;
  delimiterInput?: string;
};
type Layer = OutlineLayer;

export const sentenceSettingsCopy = {
  automatic: {
    en: "Automatically create sentence nodes",
    de: "Satzknoten automatisch anlegen",
  },
  delimiters: { en: "Sentence delimiters", de: "Satztrennzeichen" },
  delimiterHelp: {
    en: "Separate punctuation sequences with spaces, for example . ! ? or 。 ！ ？. Each sequence is one delimiter.",
    de: "Satzzeichenfolgen durch Leerzeichen trennen, zum Beispiel . ! ? oder 。 ！ ？. Jede Folge ist ein Trennzeichen.",
  },
  optionalMetadata: {
    en: "Automatic creation is unavailable when labels or titles are required. Enter these units explicitly.",
    de: "Automatisches Anlegen ist bei vorgeschriebenen Bezeichnungen oder Titeln nicht verfügbar. Legen Sie diese Einheiten ausdrücklich an.",
  },
  leafOnly: {
    en: "Automatic sentence creation is available only on a level without child units.",
    de: "Automatisches Anlegen von Sätzen ist nur auf einer Ebene ohne untergeordnete Einheiten möglich.",
  },
  invalid: {
    en: "Use 1–16 distinct punctuation sequences, each at most 8 characters, for automatic sentence creation.",
    de: "Verwenden Sie für automatische Sätze 1–16 unterschiedliche Satzzeichenfolgen mit jeweils höchstens 8 Zeichen.",
  },
} satisfies Record<string, UiMessage>;

/** Generates the same ASCII technical identity for newly authored visible labels. */
export function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "layer";
}

/** Serializes only persisted settings, excluding identity and raw input bookkeeping. */
export function withoutExisting(layers: Layer[]): OutlineKindWrite[] {
  return layers.map(
    ({ existing: _ignored, delimiterInput: _input, ...kind }) => kind,
  );
}

/** Defaults only omitted roots/children/delimiters; explicit empty child lists remain leaves. */
export function explicitLayers(
  kinds: OutlineKindWrite[],
  existing: boolean,
): Layer[] {
  return kinds.map((kind, index) => ({
    ...kind,
    root: kind.root ?? index === 0,
    allowedChildKinds:
      kind.allowedChildKinds ??
      (kinds[index + 1] ? [kinds[index + 1]!.kindCode] : []),
    sentenceDelimiters: kind.sentenceDelimiters ?? [".", "!", "?"],
    delimiterInput: (kind.sentenceDelimiters ?? [".", "!", "?"]).join(" "),
    existing,
  }));
}

/** Renames inbound relationships before applying the selected patch and its sentence-policy constraints. */
export function updateOutlineLayers(
  current: Layer[],
  index: number,
  patch: Partial<Layer>,
): Layer[] {
  return current.map((layer, i) => {
    const renamed =
      patch.kindCode && patch.kindCode !== current[index]?.kindCode;
    const children = renamed
      ? layer.allowedChildKinds?.map((code) =>
          code === current[index]?.kindCode ? patch.kindCode! : code,
        )
      : layer.allowedChildKinds;
    if (i !== index) return { ...layer, allowedChildKinds: children };
    const updated = {
      ...layer,
      ...patch,
      allowedChildKinds: patch.allowedChildKinds ?? children,
    };
    return updated.allowedChildKinds?.length ||
      updated.labelPolicy === "required" ||
      updated.titlePolicy === "required"
      ? { ...updated, segmentation: "plain" as const }
      : updated;
  });
}

/** Removes every inbound reference to a deleted kind and clears parent-text permission on new leaves. */
export function removeOutlineLayer(current: Layer[], index: number): Layer[] {
  return current
    .filter((_, i) => i !== index)
    .map((layer) => {
      const children =
        layer.allowedChildKinds?.filter(
          (code) => code !== current[index]?.kindCode,
        ) ?? [];
      return {
        ...layer,
        allowedChildKinds: children,
        allowTextAlongsideChildren: children.length
          ? layer.allowTextAlongsideChildren
          : false,
      };
    });
}

/** Computes reader capabilities from explicit children without modifying saved preferences. */
export function exampleOutlineFor(layers: Layer[]): ContentOutline {
  return {
    kinds: layers.map((layer, index) => ({
      ...layer,
      sortOrder: index + 1,
      mayHoldText:
        !layer.allowedChildKinds?.length ||
        Boolean(layer.allowTextAlongsideChildren),
      mayHoldChildren: Boolean(layer.allowedChildKinds?.length),
      allowedChildKinds: layer.allowedChildKinds ?? [],
    })),
  };
}

/** The first invalid category wins, preserving public feedback precedence. */
export function outlineValidationError(layers: Layer[]): UiMessage | null {
  const codes = layers.map((layer) => layer.kindCode.trim().toLowerCase());
  if (
    layers.some((layer) => !layer.displayLabel.trim() || !layer.kindCode.trim())
  )
    return ui.remainingStatus.outlineNameRequired;
  if (new Set(codes).size !== codes.length)
    return ui.remainingStatus.outlineUniqueCodes;
  if (!layers.some((layer) => layer.root))
    return ui.remainingStatus.outlineRootRequired;
  if (
    layers.some((layer) =>
      layer.allowedChildKinds?.some((code) => !codes.includes(code)),
    )
  )
    return ui.remainingStatus.outlineMissingChild;
  return layers.some(invalidSentenceSettings)
    ? sentenceSettingsCopy.invalid
    : outlineGraphProblem(layers);
}

/** Automatic leaves require optional metadata and 1–16 unique Unicode punctuation/symbol sequences. */
function invalidSentenceSettings(layer: Layer): boolean {
  const delimiters = layer.sentenceDelimiters ?? [".", "!", "?"];
  return Boolean(
    (layer.segmentation === "sentence" &&
      (!delimiters.length ||
        layer.allowedChildKinds?.length ||
        layer.labelPolicy === "required" ||
        layer.titlePolicy === "required")) ||
      delimiters.length > 16 ||
      new Set(delimiters).size !== delimiters.length ||
      delimiters.some(
        (delimiter) =>
          !delimiter ||
          [...delimiter].length > 8 ||
          !/^[\p{P}\p{S}]+$/u.test(delimiter),
      ),
  );
}

export type OutlineBranch = {
  index: number;
  parent: number | null;
  path: string;
  unplaced: boolean;
  children: OutlineBranch[];
};
/** Traverse relationships, including multiple allowed paths; never infer hierarchy from array position. */
export function outlineBranches(layers: Layer[]): OutlineBranch[] {
  const reached = new Set<number>(), rootReachable = new Set<number>();
  function branch(
    index: number,
    parent: number | null,
    path: number[],
    unplaced: boolean,
  ): OutlineBranch | null {
    if (path.includes(index)) return null;
    reached.add(index);
    const next = [...path, index];
    return {
      index,
      parent,
      path: next.join("-"),
      unplaced: unplaced && !rootReachable.has(index),
      children: (layers[index].allowedChildKinds ?? []).flatMap((code) => {
        const child = layers.findIndex((layer) => layer.kindCode === code);
        const result = child < 0 ? null : branch(child, index, next, unplaced);
        return result ? [result] : [];
      }),
    };
  }
  const roots = layers.flatMap((layer, index) => {
    const item = layer.root ? branch(index, null, [], false) : null;
    return item ? [item] : [];
  });
  reached.forEach(index => rootReachable.add(index));
  layers.forEach((_, index) => {
    if (!reached.has(index)) {
      const item = branch(index, null, [], true);
      if (item) roots.push(item);
    }
  });
  return roots;
}
export function outlineGraphProblem(layers: Layer[]): UiMessage | null {
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function cycle(code: string): boolean {
    if (visiting.has(code)) return true;
    if (visited.has(code)) return false;
    visiting.add(code);
    const loop = layers
      .find((layer) => layer.kindCode === code)
      ?.allowedChildKinds?.some(cycle);
    visiting.delete(code);
    visited.add(code);
    return Boolean(loop);
  }
  if (layers.some((layer) => cycle(layer.kindCode))) return structureUi.cycle;
  return outlineBranches(layers).some((branch) => branch.unplaced)
    ? structureUi.unreachable
    : null;
}
export function outlineParentChoices(layers: Layer[], index: number): number[] {
  const descendants = new Set<string>();
  function visit(code: string) {
    if (descendants.has(code)) return;
    descendants.add(code);
    layers
      .find((layer) => layer.kindCode === code)
      ?.allowedChildKinds?.forEach(visit);
  }
  visit(layers[index].kindCode);
  const connected = new Set<number>();
  function collect(branch: OutlineBranch) {
    if (!branch.unplaced) connected.add(branch.index);
    branch.children.forEach(collect);
  }
  outlineBranches(layers).forEach(collect);
  return layers.flatMap((layer, parent) =>
    connected.has(parent) &&
    !descendants.has(layer.kindCode) &&
    !layer.allowedChildKinds?.includes(layers[index].kindCode)
      ? [parent]
      : [],
  );
}
export function placeOutlineLayer(
  layers: Layer[],
  name: string,
  placement: "root" | "child" | "between",
  index: number,
  parent: number | null,
): Layer[] {
  const codes = new Set(layers.map((layer) => layer.kindCode));
  let suffix = layers.length + 1;
  while (codes.has(`layer-${suffix}`)) suffix++;
  const added: Layer = {
    kindCode: `layer-${suffix}`,
    displayLabel: name,
    presentation: "section",
    showKind: true,
    showLabel: true,
    showTitle: true,
    root: placement === "root",
    allowedChildKinds: placement === "between" ? [layers[index].kindCode] : [],
    allowTextAlongsideChildren: false,
    titlePolicy: "optional",
    labelPolicy: "optional",
    segmentation: "plain",
    labelPlacement: "before_title",
    sentenceDelimiters: [".", "!", "?"],
    existing: false,
  };
  let result = layers;
  if (placement === "child")
    result = updateOutlineLayers(layers, index, {
      allowedChildKinds: [
        ...(layers[index].allowedChildKinds ?? []),
        added.kindCode,
      ],
    });
  if (placement === "between" && parent !== null)
    result = updateOutlineLayers(layers, parent, {
      allowedChildKinds: layers[parent].allowedChildKinds?.map((code) =>
        code === layers[index].kindCode ? added.kindCode : code,
      ),
    });
  return [...result, added];
}
