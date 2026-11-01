import { T, useTranslation } from "../../components/TranslationProvider";
import { ui } from "../../../lib/messages";
import { Button, Input, Select } from "../../components/ui";
import { SettingInfo } from "../../components/SettingInfo";
import { asOutlinePresentation } from "../../../lib/outline";
import { Stack } from "../../components/layout/Layout";
import surfaceStyles from "../../components/surfaces.module.css";
import fieldStyles from "../../components/fields.module.css";
import {
  sentenceSettingsCopy,
  slugify,
  type OutlineLayer as Layer,
} from "./outline-editor-model";

type LevelProps = {
  layer: Layer;
  index: number;
  layers: Layer[];
  update: (index: number, patch: Partial<Layer>) => void;
  removeLayer: (index: number) => void;
};

/** A stable level component preserves controlled fields and the original list-item boundary. */
export function OutlineLayerEditor(props: LevelProps) {
  const { layer, index, removeLayer } = props;
  const t = useTranslation();
  return (
    <Stack as="li" className={["card", surfaceStyles.card].join(" ")}>
      <p>
        <T value={ui.admin.constitutions.outlineeditor.layer} /> {index + 1}
        {layer.root ? t(ui.remainingStatus.topLevelKind) : ""}
        {t(
          !layer.allowedChildKinds?.length
            ? ui.remainingStatus.textLeaf
            : ui.remainingStatus.structuralKind,
        )}
      </p>
      <LayerIdentity {...props} />
      <LayerStructure {...props} />
      <LayerPermissions {...props} />
      <LayerDisplay {...props} />
      {index > 0 ? (
        <span className="setting-inline">
          <Button type="button" onClick={() => removeLayer(index)}>
            <T value={ui.admin.constitutions.outlineeditor.removeLevel} />{" "}
          </Button>
          <SettingInfo
            label={
              <T value={ui.admin.constitutions.outlineeditor.removeLevel} />
            }
            description={<T value={ui.help.removeLevelHelp} />}
            changeability="review"
          />
        </span>
      ) : null}
    </Stack>
  );
}

/** Existing technical identities stay fixed; new labels can update generated codes. */
function LayerIdentity({ layer, index, update }: LevelProps) {
  return (
    <>
      <Input
        label={
          <T value={ui.attrs.adminConstitutionsOutlineeditorInputLabelLabel} />
        }
        info={{
          description: <T value={ui.help.levelLabelHelp} />,
          changeability: "review",
        }}
        name={`label-${index}`}
        value={layer.displayLabel}
        onChange={(event) => {
          const displayLabel = event.target.value;
          update(index, {
            displayLabel,
            kindCode: layer.existing ? layer.kindCode : slugify(displayLabel),
          });
        }}
      />
      <details className="creation-advanced">
        <summary>
          <T
            value={ui.admin.constitutions.outlineeditor.advancedGeneratedCode}
          />
        </summary>
        <Input
          label={
            <T value={ui.attrs.adminConstitutionsOutlineeditorInputLabelKind} />
          }
          info={{
            description: <T value={ui.help.levelKindCodeHelp} />,
            changeability: "once",
            changeNote: <T value={ui.help.levelKindCodeChange} />,
          }}
          name={`code-${index}`}
          value={layer.kindCode}
          readOnly={layer.existing}
          disabled={layer.existing}
          onChange={(event) => {
            if (!layer.existing) {
              update(index, { kindCode: slugify(event.target.value) });
            }
          }}
        />
      </details>
    </>
  );
}

/** Explicit root and child controls retain independently authored relationships. */
function LayerStructure({ layer, index, layers, update }: LevelProps) {
  return (
    <>
      <Stack as="fieldset">
        <legend>
          <T value={ui.admin.constitutions.outlineeditor.structure} />
        </legend>
        <label className="choice-row">
          <input
            type="checkbox"
            checked={Boolean(layer.root)}
            onChange={(event) => update(index, { root: event.target.checked })}
          />{" "}
          <T
            value={ui.admin.constitutions.outlineeditor.mayAppearAtTheTopLevel}
          />
        </label>
        <p className="muted">
          <T value={ui.admin.constitutions.outlineeditor.allowedChildKinds} />
        </p>
        {layers
          .filter((candidate) => candidate.kindCode !== layer.kindCode)
          .map((candidate) => (
            <label className="choice-row" key={candidate.kindCode}>
              <input
                type="checkbox"
                checked={Boolean(
                  layer.allowedChildKinds?.includes(candidate.kindCode),
                )}
                onChange={(event) =>
                  update(index, {
                    allowedChildKinds: event.target.checked
                      ? [...(layer.allowedChildKinds ?? []), candidate.kindCode]
                      : (layer.allowedChildKinds ?? []).filter(
                          (code) => code !== candidate.kindCode,
                        ),
                  })
                }
              />{" "}
              {candidate.displayLabel}
            </label>
          ))}
      </Stack>
    </>
  );
}

/** Editorial metadata and sentence settings keep their current values and disabling rules. */
function LayerPermissions({ layer, index, update }: LevelProps) {
  return (
    <>
      <Stack as="fieldset">
        <legend>
          <T value={ui.admin.constitutions.outlineeditor.editorPermissions} />
        </legend>
        {Boolean(layer.allowedChildKinds?.length) ? (
          <div className={["field", fieldStyles.field].join(" ")}>
            <span className="setting-inline">
              <label className="choice-row">
                <input
                  type="checkbox"
                  checked={Boolean(layer.allowTextAlongsideChildren)}
                  onChange={(event) =>
                    update(index, {
                      allowTextAlongsideChildren: event.target.checked,
                    })
                  }
                />{" "}
                <T
                  value={
                    ui.admin.constitutions.outlineeditor
                      .allowTextAlongsideChildUnits
                  }
                />
              </label>
              <SettingInfo
                label={
                  <T
                    value={
                      ui.admin.constitutions.outlineeditor
                        .allowTextAlongsideChildUnits
                    }
                  />
                }
                description={<T value={ui.help.unnumberedTextHelp} />}
                changeability="review"
              />
            </span>
            <span className="muted">
              <T
                value={
                  ui.admin.constitutions.outlineeditor
                    .unnumberedParentTextCanAppearBeforeBetween
                }
              />
            </span>
          </div>
        ) : (
          <p>
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .thisFinalLevelHoldsTextAndHas
              }
            />
          </p>
        )}
        <Select
          label={
            <T
              value={
                ui.attrs.adminConstitutionsOutlineeditorSelectLabelEditorial
              }
            />
          }
          info={{
            description: <T value={ui.help.editorialTitlePolicyHelp} />,
            changeability: "review",
          }}
          name={`title-policy-${index}`}
          value={layer.titlePolicy ?? "optional"}
          onChange={(event) =>
            update(index, {
              titlePolicy: event.target.value as Layer["titlePolicy"],
              showTitle:
                event.target.value === "none" ? false : layer.showTitle,
            })
          }
        >
          <option value="none">
            <T value={ui.admin.constitutions.outlineeditor.notAllowed} />
          </option>
          <option value="optional">
            <T value={ui.admin.constitutions.outlineeditor.optional} />
          </option>
          <option value="required">
            <T value={ui.admin.constitutions.outlineeditor.required} />
          </option>
        </Select>
        <Select
          label={
            <T
              value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelLiteral}
            />
          }
          info={{
            description: <T value={ui.help.legalLabelPolicyHelp} />,
            changeability: "review",
          }}
          name={`label-policy-${index}`}
          value={layer.labelPolicy ?? "optional"}
          onChange={(event) =>
            update(index, {
              labelPolicy: event.target.value as Layer["labelPolicy"],
              showLabel:
                event.target.value === "none" ? false : layer.showLabel,
            })
          }
        >
          <option value="none">
            <T value={ui.admin.constitutions.outlineeditor.notAllowed} />
          </option>
          <option value="optional">
            <T value={ui.admin.constitutions.outlineeditor.optional} />
          </option>
          <option value="required">
            <T value={ui.admin.constitutions.outlineeditor.required} />
          </option>
        </Select>
        <p className="muted">
          <T
            value={ui.admin.constitutions.outlineeditor.labelsSuchAs46aBisAnd2a}
          />
        </p>
        {!layer.allowedChildKinds?.length ? (
          <>
            <label className="choice-row">
              <input
                type="checkbox"
                name={`segmentation-${index}`}
                checked={layer.segmentation === "sentence"}
                disabled={
                  (layer.labelPolicy === "required" ||
                    layer.titlePolicy === "required") &&
                  layer.segmentation !== "sentence"
                }
                onChange={(event) =>
                  update(index, {
                    segmentation: event.target.checked ? "sentence" : "plain",
                  })
                }
              />{" "}
              <T value={sentenceSettingsCopy.automatic} />
            </label>
            {layer.labelPolicy === "required" ||
            layer.titlePolicy === "required" ? (
              <p className="muted">
                <T value={sentenceSettingsCopy.optionalMetadata} />
              </p>
            ) : null}
            {layer.segmentation === "sentence" ? (
              <Input
                label={<T value={sentenceSettingsCopy.delimiters} />}
                name={`sentence-delimiters-${index}`}
                value={
                  layer.delimiterInput ??
                  (layer.sentenceDelimiters ?? [".", "!", "?"]).join(" ")
                }
                onChange={(event) =>
                  update(index, {
                    delimiterInput: event.target.value,
                    sentenceDelimiters: event.target.value
                      .trim()
                      .split(/\s+/u)
                      .filter(Boolean),
                  })
                }
                info={{
                  description: <T value={sentenceSettingsCopy.delimiterHelp} />,
                  changeability: "review",
                }}
              />
            ) : null}
          </>
        ) : (
          <p className="muted">
            <T value={sentenceSettingsCopy.leafOnly} />
          </p>
        )}
      </Stack>
    </>
  );
}

/** Reader preferences retain saved choices even when the effective display hides them. */
function LayerDisplay({ layer, index, update }: LevelProps) {
  return (
    <>
      <Stack as="fieldset">
        <legend>
          <T value={ui.admin.constitutions.outlineeditor.publicReaderDisplay} />
        </legend>
        <Select
          label={
            <T value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelHow} />
          }
          info={{
            description: <T value={ui.help.levelPresentationHelp} />,
            changeability: "review",
          }}
          name={`presentation-${index}`}
          value={layer.presentation}
          onChange={(event) =>
            update(index, {
              presentation: asOutlinePresentation(event.target.value),
            })
          }
        >
          <option value="section">
            <T
              value={
                ui.admin.constitutions.outlineeditor.blockWithOptionalHeading
              }
            />
          </option>
          <option value="concatenated">
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .runningTextNoTitleJoinedWithSiblings
              }
            />
          </option>
        </Select>
        {
          <>
            <div className={["field", fieldStyles.field].join(" ")}>
              <span className="setting-inline">
                <label className="field-label choice-row">
                  <input
                    type="checkbox"
                    checked={layer.showKind}
                    disabled={layer.presentation === "concatenated"}
                    onChange={(event) =>
                      update(index, { showKind: event.target.checked })
                    }
                  />{" "}
                  <T
                    value={ui.admin.constitutions.outlineeditor.showKindName}
                  />
                  {layer.displayLabel})
                </label>
                <SettingInfo
                  label={
                    <T
                      value={ui.admin.constitutions.outlineeditor.showKindName}
                    />
                  }
                  description={<T value={ui.help.kindNameHelp} />}
                  changeability="review"
                />
              </span>
            </div>
            <div className={["field", fieldStyles.field].join(" ")}>
              <span className="setting-inline">
                <label className="field-label choice-row">
                  <input
                    type="checkbox"
                    checked={layer.showLabel}
                    disabled={
                      layer.labelPolicy === "none" ||
                      (layer.presentation === "concatenated" &&
                        !["inline", "superscript"].includes(
                          layer.labelPlacement ?? "before_title",
                        ))
                    }
                    onChange={(event) =>
                      update(index, { showLabel: event.target.checked })
                    }
                  />{" "}
                  <T
                    value={
                      ui.admin.constitutions.outlineeditor.showLiteralLegalLabel
                    }
                  />{" "}
                </label>
                <SettingInfo
                  label={
                    <T
                      value={
                        ui.admin.constitutions.outlineeditor
                          .showLiteralLegalLabel
                      }
                    />
                  }
                  description={<T value={ui.help.literalLabelHelp} />}
                  changeability="review"
                />
              </span>
            </div>
            <div className={["field", fieldStyles.field].join(" ")}>
              <span className="setting-inline">
                <label className="field-label choice-row">
                  <input
                    type="checkbox"
                    checked={layer.showTitle}
                    disabled={
                      layer.titlePolicy === "none" ||
                      layer.presentation === "concatenated"
                    }
                    onChange={(event) =>
                      update(index, { showTitle: event.target.checked })
                    }
                  />{" "}
                  <T
                    value={
                      ui.admin.constitutions.outlineeditor.showEditorialTitle
                    }
                  />{" "}
                </label>
                <SettingInfo
                  label={
                    <T
                      value={
                        ui.admin.constitutions.outlineeditor.showEditorialTitle
                      }
                    />
                  }
                  description={<T value={ui.help.editorialTitleHelp} />}
                  changeability="review"
                />
              </span>
            </div>
          </>
        }
        {layer.presentation === "concatenated" ? (
          <p className="muted">
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .runningTextHidesKindNamesAndEditorial
              }
            />
          </p>
        ) : null}
        {layer.titlePolicy === "none" || layer.labelPolicy === "none" ? (
          <p className="muted">
            <T
              value={ui.admin.constitutions.outlineeditor.aNameOrLabelSetToNot}
            />
          </p>
        ) : null}
        {layer.titlePolicy === "optional" &&
        layer.showTitle &&
        layer.presentation !== "concatenated" ? (
          <p className="muted">
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .untitledUnitsPlaceAVisibleLabelBefore
              }
            />
          </p>
        ) : null}
        <Select
          label={
            <T
              value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelLabel}
            />
          }
          info={{
            description: <T value={ui.help.labelPlacementHelp} />,
            changeability: "review",
          }}
          name={`label-placement-${index}`}
          value={layer.labelPlacement ?? "before_title"}
          disabled={
            layer.labelPolicy === "none" ||
            (!layer.showLabel && layer.presentation !== "concatenated")
          }
          onChange={(event) =>
            update(index, {
              labelPlacement: event.target.value as Layer["labelPlacement"],
            })
          }
        >
          <option
            value="before_title"
            disabled={layer.presentation === "concatenated"}
          >
            <T value={ui.admin.constitutions.outlineeditor.beforeTitle} />
          </option>
          <option
            value="after_title"
            disabled={
              layer.presentation === "concatenated" ||
              !layer.showTitle ||
              layer.titlePolicy === "none"
            }
          >
            <T value={ui.admin.constitutions.outlineeditor.afterTitle} />
          </option>
          <option
            value="inline"
            disabled={
              Boolean(layer.allowedChildKinds?.length) &&
              !layer.allowTextAlongsideChildren
            }
          >
            <T value={ui.admin.constitutions.outlineeditor.inlineWithText} />
          </option>
          {!layer.allowedChildKinds?.length ? (
            <option value="superscript">
              <T
                value={ui.admin.constitutions.outlineeditor.superscriptInText}
              />
            </option>
          ) : null}
        </Select>
        {!layer.showLabel && layer.presentation !== "concatenated" ? (
          <p className="muted">
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .showLiteralLegalLabelToChooseIts
              }
            />
          </p>
        ) : null}
      </Stack>
    </>
  );
}
