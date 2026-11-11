import type { ReactNode } from "react";
import { T } from "../../components/TranslationProvider";
import { Grid } from "../../components/layout/Layout";
import type { UiMessage } from "../../../lib/messages";
import { constitutionWorkspaceUi as m } from "../../../lib/constitution-workspace-messages";
import styles from "./ConstitutionWorkspace.module.css";

/** Read-only identity facts stay with their server-authorized route owner. */
export function ConstitutionFacts({
  title,
  fields,
  technical,
  children,
}: {
  title: UiMessage;
  fields: { label: UiMessage; value: ReactNode }[];
  technical?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section>
      <h3>
        <T value={title} />
      </h3>
      <dl className={styles.facts}>
        {fields.map((field, index) => (
          <div key={index}>
            <dt>
              <T value={field.label} />
            </dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      {technical ? (
        <details className={styles.technical}>
          <summary>
            <T value={m.technical} />
          </summary>
          {technical}
        </details>
      ) : null}
      {children}
    </section>
  );
}
export function ConstitutionIdentityLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Grid columns={2} gap="section" className={styles.identityGrid}>
      {children}
    </Grid>
  );
}
