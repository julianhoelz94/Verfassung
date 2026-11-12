import { useState, type Dispatch, type SetStateAction } from "react";
import type { ReaderIconName } from "../../../../apps/gateway-web/app/components/ReaderIcon";
import type { UiMessage } from "../../../../apps/gateway-web/lib/messages";
import { kinds } from "./sample";
import {
  explicitLayers,
  type OutlineLayer,
} from "../../../../apps/gateway-web/app/admin/constitutions/outline-editor-model";

export type Workflow = "create" | "settings" | "proposal";
export const workflows: Workflow[] = ["create", "settings", "proposal"];
export type View =
  | "identity"
  | "structure"
  | "documents"
  | "review"
  | "history";
export type ProposalState =
  | "proposed"
  | "requested"
  | "confirming"
  | "confirmed"
  | "withdrawn";
export const pages: Record<
  Workflow,
  { name: UiMessage; title: UiMessage; description: UiMessage }
> = {
  create: {
    name: { en: "Create constitution", de: "Verfassung anlegen" },
    title: { en: "Create a constitution", de: "Verfassung anlegen" },
    description: {
      en: "Choose the identity and structure, then review the initial setup.",
      de: "Legen Sie Identität und Aufbau fest und prüfen Sie die neue Einrichtung.",
    },
  },
  settings: {
    name: { en: "Existing settings", de: "Einstellungen" },
    title: { en: "Constitution settings", de: "Verfassungseinstellungen" },
    description: {
      en: "Adjust the shared structure and display. Check the impact before saving.",
      de: "Passen Sie Aufbau und Darstellung an. Prüfen Sie die Auswirkungen vor dem Speichern.",
    },
  },
  proposal: {
    name: { en: "Import setup review", de: "Importvorschlag prüfen" },
    title: {
      en: "Review constitution setup",
      de: "Verfassungsvorschlag prüfen",
    },
    description: {
      en: "Inspect the submitted proposal and confirm its constitution setup.",
      de: "Prüfen Sie den eingereichten Vorschlag und bestätigen Sie die Verfassungseinrichtung.",
    },
  },
};
export const views: { id: View; label: UiMessage; icon: ReaderIconName }[] = [
  { id: "identity", label: { en: "Details", de: "Angaben" }, icon: "details" },
  {
    id: "structure",
    label: { en: "Structure", de: "Struktur" },
    icon: "settings",
  },
  {
    id: "documents",
    label: { en: "Documents", de: "Dokumente" },
    icon: "link",
  },
  { id: "review", label: { en: "Review", de: "Prüfung" }, icon: "check" },
  { id: "history", label: { en: "History", de: "Verlauf" }, icon: "history" },
];

/** Each workflow retains its own draft while the shared shell changes owner. */
export function useWorkflowState<T>(
  workflow: Workflow,
  initial: (workflow: Workflow) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(workflows.map((key) => [key, initial(key)])) as Record<
        Workflow,
        T
      >,
  );
  return [
    values[workflow],
    (value) =>
      setValues((current) => ({
        ...current,
        [workflow]:
          typeof value === "function"
            ? (value as (previous: T) => T)(current[workflow])
            : value,
      })),
  ];
}
export function initialLayers(workflow: Workflow): OutlineLayer[] {
  return explicitLayers(kinds, workflow !== "create");
}
export function structureProjection(layers: OutlineLayer[]) {
  return JSON.stringify(
    layers.map(
      ({
        kindCode,
        root,
        allowedChildKinds,
        titlePolicy,
        labelPolicy,
        segmentation,
        allowTextAlongsideChildren,
      }) => ({
        kindCode,
        root,
        allowedChildKinds,
        titlePolicy,
        labelPolicy,
        segmentation,
        allowTextAlongsideChildren,
      }),
    ),
  );
}
