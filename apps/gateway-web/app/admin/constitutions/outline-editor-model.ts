import type { OutlineKindWrite, ContentOutline } from "../../../lib/api";
import { ui, type UiMessage } from "../../../lib/messages";

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

/** Inserts structural levels above a terminal sentence, otherwise after and below the last level. */
export function appendOutlineLayer(
  current: Layer[],
  displayLabel: string,
): Layer[] {
  const added: Layer = {
    kindCode: `layer-${current.length + 1}`,
    displayLabel,
    presentation: "section",
    showLabel: true,
    showTitle: true,
    showKind: false,
    root: false,
    allowedChildKinds: [],
    existing: false,
  };
  const leaf = current[current.length - 1];
  if (leaf?.kindCode === "sentence") {
    const parent = current[current.length - 2];
    return [
      ...current.slice(0, -2),
      ...(parent
        ? [
            {
              ...parent,
              allowedChildKinds: parent.allowedChildKinds?.map((code) =>
                code === "sentence" ? added.kindCode : code,
              ),
            },
          ]
        : []),
      { ...added, allowedChildKinds: ["sentence"] },
      leaf,
    ];
  }
  return [
    ...current.slice(0, -1),
    ...(leaf
      ? [
          {
            ...leaf,
            allowedChildKinds: [
              ...(leaf.allowedChildKinds ?? []),
              added.kindCode,
            ],
            segmentation: "plain" as const,
          },
        ]
      : []),
    added,
  ];
}

/** A separately rooted kind never becomes an implicit child of the existing last level. */
export function appendOutlineRoot(
  current: Layer[],
  displayLabel: string,
): Layer[] {
  return [
    ...current,
    {
      kindCode: `root-${current.length + 1}`,
      displayLabel,
      presentation: "section",
      showLabel: false,
      showTitle: true,
      showKind: true,
      root: true,
      allowedChildKinds: [],
      existing: false,
    },
  ];
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
    : null;
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
