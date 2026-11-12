import { useState } from "react";
import { useTranslation } from "../../../../apps/gateway-web/app/components/TranslationProvider";
import { Button } from "../../../../apps/gateway-web/app/components/ui";
import { pages, type Workflow } from "./workflows";
import styles from "./preview.module.css";

export function Before({ workflow }: { workflow: Workflow }) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const [width, setWidth] = useState(() => (innerWidth <= 680 ? 390 : 1440));
  const file = `before/${workflow}-de-${width}.png`;
  return (
    <main className={styles.before} id="before-content">
      <header>
        <div>
          <h1>
            {copy("Before", "Vorher")}: {t(pages[workflow].name)}
          </h1>
          <p>
            {copy(
              "Screenshot of the current application, captured locally with sample data. Original German interface.",
              "Screenshot der aktuellen Anwendung, lokal mit Beispieldaten aufgenommen. Originale deutsche Oberfläche.",
            )}
          </p>
        </div>
        <div className={styles.beforeActions}>
          <Button
            type="button"
            aria-pressed={width === 1440}
            onClick={() => setWidth(1440)}
          >
            Desktop · 1440px
          </Button>
          <Button
            type="button"
            aria-pressed={width === 390}
            onClick={() => setWidth(390)}
          >
            {copy("Mobile", "Mobil")} · 390px
          </Button>
          <a href={file} download={`${workflow}-before-${width}.png`}>
            {copy("Download screenshot", "Screenshot herunterladen")}
          </a>
        </div>
      </header>
      <img
        className={width === 390 ? styles.phoneCapture : undefined}
        src={file}
        alt={`${copy("Current page", "Aktuelle Seite")}: ${t(pages[workflow].name)} · ${width}px`}
        width={width}
      />
    </main>
  );
}
