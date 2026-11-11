"use client";

import { useState, type ReactNode } from "react";
import { TriangleAlert, MoreHorizontal } from "lucide-react";
import { structureUi as copy } from "../../../lib/structure-workspace";
import { ui } from "../../../lib/messages";
import type { OrderedNode } from "../../../lib/api";
import { outlineExample } from "../../../lib/outline-preview";
import {
  constitutionTemplates,
  outlineFromTemplate,
  type ConstitutionTemplate,
} from "../../../lib/constitution-templates";
import { useTranslation } from "../../components/TranslationProvider";
import { Button, Select } from "../../components/ui";
import { HelpTooltip } from "../../components/HelpTooltip";
import { SettingInfo } from "../../components/SettingInfo";
import { ReaderMenu, type ReaderMenuItem } from "../../components/ReaderMenu";
import { OutlineLayerEditor, type LayerSection } from "./OutlineLayerEditor";
import { OutlineReaderPreview } from "./OutlineReaderPreview";
import {
  exampleOutlineFor,
  explicitLayers,
  outlineBranches,
  outlineParentChoices,
  placeOutlineLayer,
  removeOutlineLayer,
  updateOutlineLayers,
  type OutlineLayer,
  type OutlineBranch,
} from "./outline-editor-model";
import styles from "./StructureWorkspace.module.css";

export {
  StructureWorkspaceFrame as StructureWorkspaceTemplate,
  StructurePanel,
} from "./StructureWorkspaceFrame";

type Props = {
  layers: OutlineLayer[];
  onChange: (layers: OutlineLayer[]) => void;
  structural?: boolean;
  display?: boolean;
  sampleRoots?: OrderedNode[];
  onRequestChanges?: () => void;
  onNavigate?: () => void;
  children: (parts: { navigation: ReactNode; content: ReactNode }) => ReactNode;
};
/** Common selected-level workspace; only data, permissions and workflow commands come from the host. */
export function OutlineWorkspace({
  layers,
  onChange,
  structural = true,
  display = true,
  sampleRoots = [],
  onRequestChanges,
  onNavigate,
  children,
}: Props) {
  const t = useTranslation(),
    [selected, setSelected] = useState(0),
    [section, setSection] = useState<LayerSection>("display");
  const [menu, setMenu] = useState<{
      index: number;
      parent: number | null;
      x: number;
      y: number;
      origin: HTMLElement;
    } | null>(null),
    [connecting, setConnecting] = useState(false),
    [parent, setParent] = useState("");
  const index = Math.min(selected, layers.length - 1),
    layer = layers[index],
    branches = outlineBranches(layers),
    unplaced = branches.some((branch) => branch.unplaced);

  function choose(next: number) {
    setSelected(next);
    onNavigate?.();
    setConnecting(false);
  }
  function update(position: number, patch: Partial<OutlineLayer>) {
    onChange(updateOutlineLayers(layers, position, patch));
  }
  function remove(position: number) {
    onChange(removeOutlineLayer(layers, position));
    setSelected(Math.max(0, position - 1));
    setConnecting(false);
  }
  function open(
    event: React.MouseEvent<HTMLButtonElement>,
    position: number,
    parentIndex: number | null,
  ) {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    setSelected(position);
    setMenu({
      index: position,
      parent: parentIndex,
      x: event.type === "contextmenu" ? event.clientX : box.left,
      y: event.type === "contextmenu" ? event.clientY : box.bottom,
      origin: event.currentTarget,
    });
  }
  function place(placement: "root" | "child" | "between") {
    onChange(
      placeOutlineLayer(
        layers,
        t(copy.newLevel),
        placement,
        menu?.index ?? index,
        menu?.parent ?? null,
      ),
    );
    setSelected(layers.length);
    setSection("display");
    onNavigate?.();
    setMenu(null);
  }
  function nodes(items: OutlineBranch[]): ReactNode {
    return (
      <ul className={items === branches ? styles.tree : styles.children}>
        {items.map((branch) => (
          <li
            key={branch.path}
            className={[
              styles.node,
              branch.index === index ? styles.current : "",
              branch.unplaced ? styles.warning : "",
            ].join(" ")}
            data-outline-path={branch.path}
          >
            <div className={styles.row}>
              <button
                type="button"
                className={styles.select}
                aria-current={branch.index === index}
                title={branch.unplaced ? t(copy.disconnectedHelp) : undefined}
                onClick={() => choose(branch.index)}
                onContextMenu={(event) =>
                  open(event, branch.index, branch.parent)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "ContextMenu" ||
                    (event.key === "F10" && event.shiftKey)
                  ) {
                    event.preventDefault();
                    const box = event.currentTarget.getBoundingClientRect();
                    setSelected(branch.index);
                    setMenu({
                      index: branch.index,
                      parent: branch.parent,
                      x: box.left,
                      y: box.bottom,
                      origin: event.currentTarget,
                    });
                  }
                }}
              >
                <span className={styles.name}>
                  {layers[branch.index].displayLabel}
                </span>
                <small>
                  {t(
                    branch.unplaced
                      ? copy.disconnected
                      : layers[branch.index].root && branch.parent === null
                        ? copy.root
                        : layers[branch.index].allowedChildKinds?.length
                          ? copy.parent
                          : copy.leaf,
                  )}
                </small>
              </button>
              {branch.unplaced ? (
                <HelpTooltip label={t(copy.disconnectedHelp)}>
                  <TriangleAlert size={16} aria-hidden="true" />
                </HelpTooltip>
              ) : null}
              <button
                type="button"
                className={styles.more}
                aria-label={`${t(copy.actions)} ${layers[branch.index].displayLabel}`}
                aria-haspopup="menu"
                onClick={(event) => open(event, branch.index, branch.parent)}
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            </div>
            {branch.children.length ? nodes(branch.children) : null}
          </li>
        ))}
      </ul>
    );
  }
  const menuItems: ReaderMenuItem[] = [];
  const item = (id: string, label: string, action: () => void) =>
    menuItems.push({
      id,
      label,
      onSelect: () => {
        setMenu(null);
        onNavigate?.();
        action();
      },
    });
  if (menu) {
    item("display", t(copy.editDisplay), () => setSection("display"));
    if (structural) {
      for (const entry of structuralMenuItems(
        layers,
        menu.index,
        menu.parent,
        t,
      ))
        item(entry.id, entry.label, () => {
          if (
            entry.id === "root" ||
            entry.id === "child" ||
            entry.id === "between"
          )
            place(entry.id);
          else if (entry.id === "remove") remove(menu.index);
          else {
            setSection("structure");
            setConnecting(true);
            setParent(String(outlineParentChoices(layers, menu.index)[0]));
          }
        });
    } else if (onRequestChanges)
      item("request", t(copy.request), onRequestChanges);
  }
  const navigation = (
    <nav className={styles.hierarchy} aria-label={t(copy.levels)}>
      <div className={styles.heading}>
        <h2>{t(copy.levels)}</h2>
        <SettingInfo
          label={t(copy.levels)}
          description={t(copy.levelsHelp)}
          changeability="review"
        />
      </div>
      {nodes(branches)}
      {structural ? (
        <Button type="button" onClick={() => place("root")}>
          {t(copy.newLevel)}
        </Button>
      ) : null}
    </nav>
  );
  const content = (
    <>
      {unplaced ? (
        <p className={styles.warningText} role="status">
          {t(copy.unreachable)}
        </p>
      ) : null}
      {layer ? (
        <div className={styles.workspace}>
          <section
            className={styles.editor}
            aria-label={`${layer.displayLabel} ${t(copy.structure)}`}
          >
            <header>
              <small>
                {t(layer.allowedChildKinds?.length ? copy.parent : copy.leaf)}
              </small>
              <h2>{layer.displayLabel}</h2>
            </header>
            <nav className={styles.sections} aria-label={t(copy.display)}>
              {(["display", "structure", "editing"] as const).map((tab) => (
                <button
                  type="button"
                  key={tab}
                  aria-pressed={section === tab}
                  onClick={() => setSection(tab)}
                >
                  {t(copy[tab])}
                </button>
              ))}
            </nav>
            <div className={styles.fields}>
              {connecting ? (
                <div>
                  <h3>{t(copy.connect)}</h3>
                  <p>{t(copy.connectionHelp)}</p>
                  <Select
                    label={t(copy.parentLevel)}
                    value={parent}
                    onChange={(event) => setParent(event.target.value)}
                  >
                    {outlineParentChoices(layers, index).map((position) => (
                      <option value={position} key={position}>
                        {layers[position].displayLabel} → {layer.displayLabel}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    onClick={() => {
                      const position = Number(parent);
                      if (
                        outlineParentChoices(layers, index).includes(position)
                      )
                        update(position, {
                          allowedChildKinds: [
                            ...(layers[position].allowedChildKinds ?? []),
                            layer.kindCode,
                          ],
                        });
                      setConnecting(false);
                    }}
                  >
                    {t(copy.connectSave)}
                  </Button>
                  <Button type="button" onClick={() => setConnecting(false)}>
                    {t(copy.cancel)}
                  </Button>
                </div>
              ) : null}
              <OutlineLayerEditor
                key={index}
                layer={layer}
                index={index}
                layers={layers}
                section={section}
                structural={structural}
                display={display}
                update={update}
                removeLayer={structural ? remove : undefined}
              />
              {!structural && onRequestChanges ? (
                <Button type="button" onClick={onRequestChanges}>
                  {t(copy.request)}
                </Button>
              ) : null}
            </div>
          </section>
          <StructurePreview layers={layers} sampleRoots={sampleRoots} />
        </div>
      ) : (
        <p>{t(copy.newLevel)}</p>
      )}
    </>
  );
  return (
    <>
      {children({ navigation, content })}
      {menu ? (
        <ReaderMenu
          title={`${t(copy.actions)} ${layers[menu.index].displayLabel}`}
          items={menuItems}
          position={menu}
          origin={menu.origin}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

export function StructurePreview({
  layers,
  sampleRoots = [],
}: {
  layers: OutlineLayer[];
  sampleRoots?: OrderedNode[];
}) {
  const t = useTranslation(),
    [source, setSource] = useState(sampleRoots.length > 0),
    outline = exampleOutlineFor(layers);
  return (
    <section
      className={styles.preview}
      aria-label={t(ui.admin.constitutions.outlineeditor.readerPreview)}
    >
      <div className={styles.previewHead}>
        <h2>{t(ui.admin.constitutions.outlineeditor.readerPreview)}</h2>
        <span>{t(source ? copy.sourceSample : copy.example)}</span>
      </div>
      {sampleRoots.length ? (
        <Select
          className={styles.previewSource}
          label={t(copy.preview)}
          value={source ? "source" : "example"}
          onChange={(event) => setSource(event.target.value === "source")}
        >
          <option value="example">{t(copy.example)}</option>
          <option value="source">{t(copy.sourceSample)}</option>
        </Select>
      ) : null}
      <div className={styles.paper}>
        <OutlineReaderPreview
          roots={source ? sampleRoots : outlineExample(outline, t)}
          outline={outline}
        />
      </div>
    </section>
  );
}

export function StructureTemplates({
  value,
  onChoose,
}: {
  value: ConstitutionTemplate;
  onChoose: (id: ConstitutionTemplate) => void;
}) {
  const t = useTranslation(),
    [choice, setChoice] = useState(value),
    preset =
      constitutionTemplates.find((item) => item.id === choice) ??
      constitutionTemplates[0];
  return (
    <section className={styles.templates}>
      <div>
        <h2>{t(copy.chooseTemplate)}</h2>
        <p className="muted">{t(copy.templateHelp)}</p>
        <div className={styles.templateList}>
          {constitutionTemplates.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={item.id === choice}
              onClick={() => setChoice(item.id)}
            >
              {t(item.title)}
              <small>{t(item.detail)}</small>
            </button>
          ))}
        </div>
        <div className={styles.templateDetail}>
          <a href={preset.source} target="_blank" rel="noreferrer">
            {t(copy.reference)}
          </a>
          <Button
            type="button"
            variant="primary"
            onClick={() => onChoose(preset.id)}
          >
            {t(copy.useTemplate)}
          </Button>
        </div>
      </div>
      <StructurePreview
        layers={explicitLayers(outlineFromTemplate(preset.id), false)}
      />
    </section>
  );
}

function structuralMenuItems(
  layers: OutlineLayer[],
  index: number,
  parent: number | null,
  t: ReturnType<typeof useTranslation>,
) {
  const items: Array<{
    id: "child" | "between" | "connect" | "root" | "remove";
    label: string;
  }> = [
    { id: "child", label: `${t(copy.addChild)} ${layers[index].displayLabel}` },
  ];
  if (parent !== null)
    items.push({
      id: "between",
      label: `${t(copy.between)} ${layers[parent].displayLabel} ${t(copy.and)} ${layers[index].displayLabel}`,
    });
  if (outlineParentChoices(layers, index).length)
    items.push({ id: "connect", label: t(copy.connect) });
  items.push({ id: "root", label: t(copy.addRoot) });
  if (layers.length > 1)
    items.push({
      id: "remove",
      label: t(ui.admin.constitutions.outlineeditor.removeLevel),
    });
  return items;
}
