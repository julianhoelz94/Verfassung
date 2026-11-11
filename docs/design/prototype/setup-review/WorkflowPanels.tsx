import type { RefObject } from "react";
import { useTranslation } from "../../../../apps/gateway-web/app/components/TranslationProvider";
import {
  Alert,
  Button,
  Card,
  TextArea,
} from "../../../../apps/gateway-web/app/components/ui";
import {
  Inline,
  Stack,
} from "../../../../apps/gateway-web/app/components/layout/Layout";
import { ReaderIcon } from "../../../../apps/gateway-web/app/components/ReaderIcon";
import {
  OutlineFeedback,
  OutlineReviewCard,
} from "../../../../apps/gateway-web/app/admin/constitutions/OutlineCreationStages";
import {
  exampleOutlineFor,
  type OutlineLayer,
} from "../../../../apps/gateway-web/app/admin/constitutions/outline-editor-model";
import type { SettingsImpact } from "../../../../apps/gateway-web/lib/api";
import type { Basics } from "./CreationDetails";
import type { ProposalState, View, Workflow } from "./workflows";
import { title } from "./sample";
import styles from "./preview.module.css";

export function Identity({
  workflow,
  choose,
  revision,
}: {
  workflow: Workflow;
  choose: (view: View) => void;
  revision: number;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  return (
    <Stack gap="section">
      {workflow === "proposal" ? (
        <div className={styles.changeStrip}>
          <ReaderIcon name="history" />
          <p>
            {copy("Revised proposal", "Überarbeiteter Vorschlag")}
            <small>
              {copy(
                "Source reference added · Paragraph display adjusted",
                "Quellenangabe ergänzt · Absatzdarstellung angepasst",
              )}
            </small>
          </p>
          <button type="button" onClick={() => choose("history")}>
            {copy("View changes", "Änderungen ansehen")}
            <ReaderIcon name="right" />
          </button>
        </div>
      ) : null}
      <div className={styles.summaryGrid}>
        <section>
          <h3>{copy("Identity and ownership", "Identität und Zuordnung")}</h3>
          <dl className={styles.facts}>
            <div>
              <dt>{copy("Country", "Land")}</dt>
              <dd>{copy("Germany", "Deutschland")} · DE</dd>
            </div>
            <div>
              <dt>{copy("Constitution", "Verfassung")}</dt>
              <dd>{title}</dd>
            </div>
            <div>
              <dt>{copy("Language", "Sprache")}</dt>
              <dd>Deutsch · de</dd>
            </div>
            <div>
              <dt>{copy("Scope", "Zuordnung")}</dt>
              <dd>
                {copy(
                  "National · No predecessor specified",
                  "National · Kein Vorgänger angegeben",
                )}
              </dd>
            </div>
          </dl>
          <details className={styles.secondary}>
            <summary>
              {copy("Technical identifier", "Technische Kennung")}
            </summary>
            <code>grundgesetz</code>
          </details>
        </section>
        {workflow === "proposal" ? (
          <section>
            <h3>{copy("Source of the proposal", "Quelle des Vorschlags")}</h3>
            <p className={styles.sourceTitle}>Bundesgesetzblatt 1949, S. 1</p>
            <p className={styles.muted}>
              {copy(
                "Basic Law, promulgated on 23 May 1949. The reading sample is an excerpt.",
                "Grundgesetz, verkündet am 23. Mai 1949. Das Lesebeispiel ist ein Auszug.",
              )}
            </p>
            <a
              className={styles.sourceLink}
              href="https://www.gesetze-im-internet.de/gg/"
              target="_blank"
              rel="noreferrer"
            >
              gesetze-im-internet.de/gg
              <ReaderIcon name="external" />
            </a>
            <p className={styles.muted}>
              {copy(
                "Supplementary documents remain separate from these proposed source details.",
                "Ergänzende Dokumente bleiben von diesen vorgeschlagenen Quellenangaben getrennt.",
              )}
            </p>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => choose("documents")}
            >
              {copy("View evidence", "Belege ansehen")}
              <ReaderIcon name="right" />
            </button>
          </section>
        ) : (
          <section>
            <h3>{copy("Saved settings", "Gespeicherte Einstellungen")}</h3>
            <dl className={styles.facts}>
              <div>
                <dt>{copy("Revision", "Revision")}</dt>
                <dd>{revision}</dd>
              </div>
              <div>
                <dt>{copy("Text versions", "Textversionen")}</dt>
                <dd>
                  {copy("2 published versions", "2 veröffentlichte Fassungen")}
                </dd>
              </div>
              <div>
                <dt>{copy("Drafts", "Entwürfe")}</dt>
                <dd>
                  {copy(
                    "1 open editorial draft",
                    "1 offener redaktioneller Entwurf",
                  )}
                </dd>
              </div>
            </dl>
            <p className={styles.muted}>
              {copy(
                "Saved versions retain their structural revision pins. Changes must pass an impact check.",
                "Gespeicherte Fassungen behalten ihre Strukturbezüge. Änderungen benötigen eine Auswirkungsprüfung.",
              )}
            </p>
            <Button type="button" onClick={() => choose("review")}>
              {copy("Review impact", "Auswirkungen prüfen")}
              <ReaderIcon name="right" />
            </Button>
          </section>
        )}
      </div>
    </Stack>
  );
}

type ReviewProps = {
  workflow: Workflow;
  layers: OutlineLayer[];
  basics: Basics;
  state: ProposalState;
  reason: string;
  setReason: (value: string) => void;
  recordedReason: string;
  choose: (view: View) => void;
  onCreate: () => void;
  created: boolean;
  onConfirm: () => void;
  onRequest: () => void;
  withdrawal: RefObject<HTMLDialogElement | null>;
  impact: SettingsImpact | null;
  checkImpact: () => void;
  onSave: () => void;
  revision: number;
  validation: string | null;
};
export function Review(props: ReviewProps) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const { workflow, layers, basics, choose, impact, state } = props;
  const reviewTitle =
    workflow === "settings"
      ? copy("Review the impact", "Auswirkungen prüfen")
      : workflow === "create"
        ? copy("Review before creating", "Vor dem Anlegen prüfen")
        : copy("Before confirming", "Vor der Bestätigung");
  const editable = state === "proposed" || state === "requested";
  return (
    <Stack gap="card">
      <div>
        <h3>{reviewTitle}</h3>
        <p className={styles.muted}>
          {workflow === "settings"
            ? copy(
                "Check which versions and drafts are affected and whether a reviewed migration is required.",
                "Prüfen Sie, welche Fassungen und Entwürfe betroffen sind und ob eine geprüfte Migration erforderlich ist.",
              )
            : copy(
                "Review the identity, hierarchy and reading display together.",
                "Prüfen Sie Identität, Gliederung und Lesedarstellung gemeinsam.",
              )}
        </p>
      </div>
      {props.validation ? <Alert tone="error">{props.validation}</Alert> : null}
      <ol className={styles.checklist}>
        {[
          {
            title: copy("Identity and ownership", "Identität und Zuordnung"),
            detail:
              workflow === "create"
                ? `${basics.title || "—"} · ${basics.countryName} (${basics.isoCode})`
                : `${copy("Germany", "Deutschland")} · ${title}`,
            target: "identity",
          },
          {
            title: copy("Structure and display", "Struktur und Darstellung"),
            detail: layers.map((layer) => layer.displayLabel).join(" → "),
            target: "structure",
          },
          {
            title: copy("Documents and history", "Dokumente und Verlauf"),
            detail:
              workflow === "create"
                ? copy(
                    "Documents can be linked once the constitution exists.",
                    "Dokumente können nach dem Anlegen verknüpft werden.",
                  )
                : copy(
                    "Evidence retains its cited revision and contextual notes.",
                    "Belege behalten ihre zitierte Revision und ihre Kontextnotizen.",
                  ),
            target: "documents",
          },
        ].map((row, index) => (
          <li key={row.target}>
            <span>{index + 1}</span>
            <div>
              <h4>{row.title}</h4>
              <p>{row.detail}</p>
            </div>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => choose(row.target as View)}
            >
              {copy("Inspect", "Ansehen")}
              <ReaderIcon name="right" />
            </button>
          </li>
        ))}
      </ol>
      <details className={styles.secondary}>
        <summary>
          {copy("Settings for each level", "Einstellungen je Ebene")}
        </summary>
        <Stack gap="field">
          {layers.map((layer, index) => (
            <OutlineReviewCard
              key={layer.kindCode}
              layer={layer}
              index={index}
              displayKind={exampleOutlineFor(layers).kinds[index]}
            />
          ))}
        </Stack>
      </details>
      {workflow === "create" ? (
        <Card>
          <h3>{copy("Create constitution", "Verfassung anlegen")}</h3>
          <p className={styles.muted}>
            {copy(
              "Create the constitution and its initial structure. Wording and publication follow separately.",
              "Verfassung und Anfangsstruktur anlegen. Text und Veröffentlichung folgen gesondert.",
            )}
          </p>
          <Button
            type="button"
            variant="primary"
            disabled={props.created || Boolean(props.validation)}
            onClick={props.onCreate}
          >
            {props.created
              ? copy("Created in this mock", "Im Entwurf angelegt")
              : copy("Create constitution", "Verfassung anlegen")}
            <ReaderIcon name="check" />
          </Button>
        </Card>
      ) : null}
      {workflow === "settings" ? (
        <>
          <OutlineFeedback
            showErrors={Boolean(props.validation)}
            outlineError={props.validation}
            impactError={false}
            submitError={false}
            impact={impact}
          />
          <Inline>
            <Button type="button" onClick={props.checkImpact}>
              {copy("Check impact", "Auswirkungen prüfen")}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={
                !impact ||
                impact.classification === "migration_required" ||
                impact.currentRevisionId !== `settings-${props.revision}`
              }
              onClick={props.onSave}
            >
              {copy("Save settings", "Einstellungen speichern")}
              <ReaderIcon name="check" />
            </Button>
          </Inline>
          {impact?.classification === "migration_required" ? (
            <p className={styles.muted}>
              {copy(
                "Direct saving is blocked. The affected wording needs a reviewed successor migration.",
                "Direktes Speichern ist gesperrt. Der betroffene Wortlaut benötigt eine geprüfte Nachfolgemigration.",
              )}
            </p>
          ) : (
            <p className={styles.muted}>
              {copy(
                "Changing any setting invalidates the previous check. Historical structural pins remain unchanged.",
                "Jede weitere Änderung setzt die vorige Prüfung zurück. Historische Strukturbezüge bleiben unverändert.",
              )}
            </p>
          )}
        </>
      ) : null}
      {workflow === "proposal" ? (
        <>
          {!["confirmed", "withdrawn"].includes(state) ? (
            <Card>
              <h3>{copy("Confirm setup", "Einrichtung bestätigen")}</h3>
              <p className={styles.muted}>
                {copy(
                  "Confirmation creates setup only. Text import and publication remain separate.",
                  "Die Bestätigung legt nur die Einrichtung an. Textimport und Veröffentlichung bleiben getrennt.",
                )}
              </p>
              <Button
                type="button"
                variant="primary"
                disabled={state === "requested" || Boolean(props.validation)}
                onClick={props.onConfirm}
              >
                {state === "confirming"
                  ? copy("Resume confirmation", "Bestätigung fortsetzen")
                  : copy("Confirm setup", "Einrichtung bestätigen")}
                <ReaderIcon name="check" />
              </Button>
              {state === "requested" ? (
                <p className={styles.muted}>
                  {copy(
                    "A revised proposal is required before confirmation.",
                    "Vor der Bestätigung ist ein überarbeiteter Vorschlag erforderlich.",
                  )}
                </p>
              ) : null}
            </Card>
          ) : null}
          {editable ? (
            <details className={styles.feedback} open={Boolean(props.reason)}>
              <summary>
                {copy(
                  "Something needs correcting?",
                  "Etwas muss korrigiert werden?",
                )}
              </summary>
              <Stack>
                <TextArea
                  id="requested-changes"
                  label={copy("Requested changes", "Gewünschte Änderungen")}
                  value={props.reason}
                  onChange={(event) => props.setReason(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  help={copy(
                    "Keep correction rationale separate from proposed content. At least 10 characters.",
                    "Korrekturgrund und vorgeschlagenen Inhalt getrennt halten. Mindestens 10 Zeichen.",
                  )}
                />
                <Button
                  type="button"
                  disabled={props.reason.trim().length < 10}
                  onClick={props.onRequest}
                >
                  {copy("Request changes", "Änderungen anfordern")}
                </Button>
              </Stack>
            </details>
          ) : null}
          {editable ? (
            <div className={styles.withdraw}>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => props.withdrawal.current?.showModal()}
              >
                {copy("Withdraw proposal", "Vorschlag zurückziehen")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}

export function History({
  workflow,
  revision,
  saved,
  created,
  recordedReason,
  confirmed,
  restore,
}: {
  workflow: Workflow;
  revision: number;
  saved: boolean;
  created: boolean;
  recordedReason: string;
  confirmed: boolean;
  restore: () => void;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  if (workflow === "create")
    return (
      <Stack gap="card">
        <h3>{copy("History", "Verlauf")}</h3>
        <p className={styles.muted}>
          {created
            ? copy(
                "Constitution and initial structure created in this mock.",
                "Verfassung und Anfangsstruktur wurden in diesem Entwurf angelegt.",
              )
            : copy(
                "The settings history starts after creation. Your current work is an unsaved draft.",
                "Der Einstellungsverlauf beginnt nach dem Anlegen. Ihre aktuelle Arbeit ist ein ungespeicherter Entwurf.",
              )}
        </p>
      </Stack>
    );
  return (
    <Stack gap="card">
      <h3>
        {workflow === "settings"
          ? copy("Settings history", "Verlauf der Einstellungen")
          : copy("Proposal history", "Verlauf des Vorschlags")}
      </h3>
      <ol className={styles.timeline}>
        {saved ? (
          <li>
            <span className={styles.eyebrow}>
              {copy("Just now", "Gerade eben")}
            </span>
            <h4>
              {copy("Settings saved", "Einstellungen gespeichert")} · {revision}
            </h4>
            <p>
              {copy(
                "A new example settings revision was created.",
                "Eine neue Beispieleinstellungsrevision wurde angelegt.",
              )}
            </p>
          </li>
        ) : null}
        {confirmed && workflow === "proposal" ? (
          <li>
            <h4>{copy("Setup confirmed", "Einrichtung bestätigt")}</h4>
            <p>
              {copy(
                "Constitution and structure created in this mock.",
                "Verfassung und Struktur in diesem Entwurf angelegt.",
              )}
            </p>
          </li>
        ) : null}
        {recordedReason && workflow === "proposal" ? (
          <li>
            <h4>{copy("Changes requested", "Änderungen angefordert")}</h4>
            <p>{recordedReason}</p>
          </li>
        ) : null}
        <li>
          <span className={styles.eyebrow}>
            {copy("Current revision", "Aktuelle Revision")} ·{" "}
            {workflow === "settings" ? revision : 2}
          </span>
          <h4>
            {workflow === "settings"
              ? copy(
                  "Saved structure and display",
                  "Gespeicherter Aufbau und Darstellung",
                )
              : copy(
                  "Source and display revised",
                  "Quelle und Darstellung überarbeitet",
                )}
          </h4>
          <p>
            {workflow === "settings"
              ? copy(
                  "Published wording keeps its own pinned structure.",
                  "Veröffentlichter Wortlaut behält seine festgelegte Struktur.",
                )
              : copy(
                  "Source reference added; paragraphs shown as running text. Hierarchy and wording unchanged.",
                  "Quellenangabe ergänzt; Absätze im Fließtext. Gliederung und Wortlaut unverändert.",
                )}
          </p>
        </li>
        <li>
          <span className={styles.eyebrow}>
            {copy("Previous revision", "Vorige Revision")}
          </span>
          <h4>
            {workflow === "settings"
              ? copy(
                  "Earlier display settings",
                  "Frühere Darstellungseinstellungen",
                )
              : copy("Proposal submitted", "Vorschlag eingereicht")}
          </h4>
          <p>
            {copy(
              "Paragraphs were shown as separate blocks.",
              "Absätze wurden als einzelne Blöcke angezeigt.",
            )}
          </p>
          {workflow === "settings" ? (
            <Button type="button" onClick={restore}>
              {copy("Restore as draft", "Als Entwurf wiederherstellen")}
            </Button>
          ) : null}
        </li>
      </ol>
    </Stack>
  );
}
