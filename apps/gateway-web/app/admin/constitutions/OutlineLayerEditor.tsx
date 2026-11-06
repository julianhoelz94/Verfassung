"use client";

import { useTranslation } from "../../components/TranslationProvider";
import { ui, type UiMessage } from "../../../lib/messages";
import { structureUi as copy } from "../../../lib/structure-workspace";
import { Button, Input, Select } from "../../components/ui";
import { SettingInfo } from "../../components/SettingInfo";
import { Stack } from "../../components/layout/Layout";
import {
  sentenceSettingsCopy,
  slugify,
  type OutlineLayer,
} from "./outline-editor-model";

export type LayerSection = "structure" | "editing" | "display";
type Props = {
  layer: OutlineLayer;
  index: number;
  layers: OutlineLayer[];
  section: LayerSection;
  structural: boolean;
  display: boolean;
  update: (index: number, patch: Partial<OutlineLayer>) => void;
  removeLayer?: (index: number) => void;
};

function Check({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: UiMessage;
  help: UiMessage;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <span className="setting-inline">
      <label className="choice-row">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {t(label)}
      </label>
      <SettingInfo
        label={t(label)}
        description={t(help)}
        changeability="review"
      />
    </span>
  );
}
/** Stable, shared fields: native disclosure state survives help clicks and controlled edits. */
export function OutlineLayerEditor(props: Props) {
  const {
      layer,
      index,
      layers,
      section,
      structural,
      display,
      update,
      removeLayer,
    } = props,
    t = useTranslation();
  const patch = (value: Partial<OutlineLayer>) => update(index, value);
  const info = (help: UiMessage) => ({
    description: t(help),
    changeability: "review" as const,
  });
  const running = layer.presentation === "concatenated",
    hasChildren = Boolean(layer.allowedChildKinds?.length),
    mayHoldText = !hasChildren || Boolean(layer.allowTextAlongsideChildren);
  return (
    <Stack>
      {!structural && section !== "display" ? (
        <p className="muted">{t(copy.restricted)}</p>
      ) : null}
      <div hidden={section !== "structure"}>
        <Stack>
          <Check
            label={copy.top}
            help={copy.topHelp}
            checked={Boolean(layer.root)}
            disabled={!structural}
            onChange={(root) => patch({ root })}
          />
          <fieldset>
            <legend className="setting-inline">
              {t(ui.admin.constitutions.outlineeditor.allowedChildKinds)}
              <SettingInfo
                label={t(copy.levels)}
                description={t(copy.levelsHelp)}
                changeability="review"
              />
            </legend>
            {layers.map((candidate, child) =>
              child === index ? null : (
                <label className="choice-row" key={child}>
                  <input
                    type="checkbox"
                    disabled={!structural}
                    checked={
                      layer.allowedChildKinds?.includes(candidate.kindCode) ??
                      false
                    }
                    onChange={(event) =>
                      patch({
                        allowedChildKinds: event.target.checked
                          ? [
                              ...(layer.allowedChildKinds ?? []),
                              candidate.kindCode,
                            ]
                          : (layer.allowedChildKinds ?? []).filter(
                              (code) => code !== candidate.kindCode,
                            ),
                      })
                    }
                  />
                  {candidate.displayLabel}
                </label>
              ),
            )}
          </fieldset>
          <details>
            <summary>{t(copy.technical)}</summary>
            <Input
              label={t(copy.code)}
              info={{
                ...info(ui.help.levelKindCodeHelp),
                changeability: "once",
                changeNote: t(ui.help.levelKindCodeChange),
              }}
              name={`code-${index}`}
              value={layer.kindCode}
              readOnly={layer.existing}
              disabled={!structural || layer.existing}
              onChange={(event) =>
                patch({ kindCode: slugify(event.target.value) })
              }
            />
          </details>
          {structural && removeLayer ? (
            <Button
              type="button"
              disabled={layers.length === 1}
              onClick={() => removeLayer(index)}
            >
              {t(ui.admin.constitutions.outlineeditor.removeLevel)}
            </Button>
          ) : null}
        </Stack>
      </div>
      <div hidden={section !== "editing"}>
        <Stack>
          {hasChildren ? (
            <Check
              label={
                ui.admin.constitutions.outlineeditor
                  .allowTextAlongsideChildUnits
              }
              help={ui.help.unnumberedTextHelp}
              checked={Boolean(layer.allowTextAlongsideChildren)}
              disabled={!structural}
              onChange={(allowTextAlongsideChildren) =>
                patch({ allowTextAlongsideChildren })
              }
            />
          ) : (
            <p className="muted">
              {t(
                ui.admin.constitutions.outlineeditor
                  .thisFinalLevelHoldsTextAndHas,
              )}
            </p>
          )}
          {(["titlePolicy", "labelPolicy"] as const).map((key) => (
            <Select
              key={key}
              label={t(key === "titlePolicy" ? copy.titles : copy.labels)}
              info={info(
                key === "titlePolicy" ? copy.titleHelp : copy.labelHelp,
              )}
              name={`${key === "titlePolicy" ? "title" : "label"}-policy-${index}`}
              value={layer[key] ?? "optional"}
              disabled={!structural}
              onChange={(event) =>
                patch({
                  [key]: event.target.value,
                  ...(event.target.value === "none"
                    ? {
                        [key === "titlePolicy" ? "showTitle" : "showLabel"]:
                          false,
                      }
                    : {}),
                })
              }
            >
              {(["none", "optional", "required"] as const).map((value, i) => (
                <option key={value} value={value}>
                  {t(
                    [
                      ui.admin.constitutions.outlineeditor.notAllowed,
                      ui.admin.constitutions.outlineeditor.optional,
                      ui.admin.constitutions.outlineeditor.required,
                    ][i],
                  )}
                </option>
              ))}
            </Select>
          ))}
          {!hasChildren ? (
            <>
              <Check
                label={sentenceSettingsCopy.automatic}
                help={ui.help.textEditingHelp}
                checked={layer.segmentation === "sentence"}
                disabled={
                  !structural ||
                  layer.labelPolicy === "required" ||
                  layer.titlePolicy === "required"
                }
                onChange={(automatic) =>
                  patch({ segmentation: automatic ? "sentence" : "plain" })
                }
              />
              {layer.labelPolicy === "required" ||
              layer.titlePolicy === "required" ? (
                <p className="muted">
                  {t(sentenceSettingsCopy.optionalMetadata)}
                </p>
              ) : null}
              {layer.segmentation === "sentence" ? (
                <Input
                  label={t(sentenceSettingsCopy.delimiters)}
                  info={info(sentenceSettingsCopy.delimiterHelp)}
                  name={`sentence-delimiters-${index}`}
                  value={
                    layer.delimiterInput ??
                    layer.sentenceDelimiters?.join(" ") ??
                    ". ! ?"
                  }
                  disabled={!structural}
                  onChange={(event) =>
                    patch({
                      delimiterInput: event.target.value,
                      sentenceDelimiters: event.target.value
                        .trim()
                        .split(/\s+/u)
                        .filter(Boolean),
                    })
                  }
                />
              ) : null}
            </>
          ) : (
            <p className="muted">{t(sentenceSettingsCopy.leafOnly)}</p>
          )}
        </Stack>
      </div>
      <div hidden={section !== "display"}>
        <Stack>
          <Input
            label={t(copy.name)}
            info={info(ui.help.levelLabelHelp)}
            name={`label-${index}`}
            value={layer.displayLabel}
            disabled={!display}
            onChange={(event) =>
              patch({
                displayLabel: event.target.value,
                ...(!layer.existing
                  ? { kindCode: slugify(event.target.value) }
                  : {}),
              })
            }
          />
          <Select
            label={t(ui.attrs.adminConstitutionsOutlineeditorSelectLabelHow)}
            info={info(ui.help.levelPresentationHelp)}
            name={`presentation-${index}`}
            value={layer.presentation ?? "section"}
            disabled={!display}
            onChange={(event) =>
              patch({
                presentation: event.target
                  .value as OutlineLayer["presentation"],
              })
            }
          >
            <option value="section">
              {t(ui.admin.constitutions.outlineeditor.blockWithOptionalHeading)}
            </option>
            <option value="concatenated">
              {t(
                ui.admin.constitutions.outlineeditor
                  .runningTextNoTitleJoinedWithSiblings,
              )}
            </option>
          </Select>
          <Check
            label={ui.admin.constitutions.outlineeditor.showKindName}
            help={ui.help.kindNameHelp}
            checked={Boolean(layer.showKind)}
            disabled={!display || running}
            onChange={(showKind) => patch({ showKind })}
          />
          <Check
            label={copy.showLabel}
            help={copy.labelHelp}
            checked={layer.showLabel !== false}
            disabled={
              !display ||
              layer.labelPolicy === "none" ||
              (running &&
                !["inline", "superscript"].includes(
                  layer.labelPlacement ?? "before_title",
                ))
            }
            onChange={(showLabel) => patch({ showLabel })}
          />
          <Check
            label={copy.showTitle}
            help={copy.titleHelp}
            checked={layer.showTitle !== false}
            disabled={!display || running || layer.titlePolicy === "none"}
            onChange={(showTitle) => patch({ showTitle })}
          />
          {running ? (
            <p className="muted">
              {t(
                ui.admin.constitutions.outlineeditor
                  .runningTextHidesKindNamesAndEditorial,
              )}
            </p>
          ) : null}
          <Select
            label={t(copy.placement)}
            info={info(ui.help.labelPlacementHelp)}
            name={`label-placement-${index}`}
            value={layer.labelPlacement ?? "before_title"}
            disabled={
              !display ||
              layer.labelPolicy === "none" ||
              (!layer.showLabel && !running)
            }
            onChange={(event) =>
              patch({
                labelPlacement: event.target
                  .value as OutlineLayer["labelPlacement"],
              })
            }
          >
            <option value="before_title" disabled={running}>
              {t(ui.admin.constitutions.outlineeditor.beforeTitle)}
            </option>
            <option
              value="after_title"
              disabled={
                running || !layer.showTitle || layer.titlePolicy === "none"
              }
            >
              {t(ui.admin.constitutions.outlineeditor.afterTitle)}
            </option>
            <option value="inline" disabled={!mayHoldText}>
              {t(ui.admin.constitutions.outlineeditor.inlineWithText)}
            </option>
            <option value="superscript" disabled={hasChildren}>
              {t(ui.admin.constitutions.outlineeditor.superscriptInText)}
            </option>
          </Select>
        </Stack>
      </div>
    </Stack>
  );
}
