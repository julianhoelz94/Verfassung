import { useRef, type FormEvent } from "react";
import { ConstitutionBasicsFields } from "../../../../apps/gateway-web/app/admin/constitutions/ConstitutionBasicsFields";
import {
  Button,
  DataList,
  DataRow,
} from "../../../../apps/gateway-web/app/components/ui";
import { useTranslation } from "../../../../apps/gateway-web/app/components/TranslationProvider";
import type {
  CountryDetail,
  CountrySummary,
} from "../../../../apps/gateway-web/lib/api";
import countries from "../../../../apps/gateway-web/lib/contracts/catalog-countries.json";
import germany from "../../../../apps/gateway-web/lib/contracts/catalog-country-DE.json";
import styles from "./preview.module.css";

export type Basics = {
  title: string;
  slug: string;
  isoCode: string;
  countryName: string;
  predecessor: string;
  interim: boolean;
};
export const emptyBasics: Basics = {
  title: "",
  slug: "",
  isoCode: "DE",
  countryName: "Germany",
  predecessor: "",
  interim: false,
};

export function CreationDetails({
  onSummary,
  onContinue,
  onSettings,
  disabled,
}: {
  onSummary: (value: Basics) => void;
  onContinue: () => void;
  onSettings: () => void;
  disabled: boolean;
}) {
  const form = useRef<HTMLFormElement>(null),
    t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  function read() {
    if (!form.current) return;
    const data = new FormData(form.current),
      choice = String(data.get("countryChoice") || "DE");
    onSummary({
      title: String(data.get("title") || ""),
      slug: String(data.get("slug") || ""),
      isoCode: String(data.get("isoCode") || choice),
      countryName:
        choice === "__new__"
          ? String(data.get("countryName") || "")
          : countries.find((country) => country.isoCode === choice)?.name ||
            choice,
      predecessor: String(data.get("predecessorConstitutionId") || ""),
      interim: data.get("interim") === "on",
    });
  }
  function advance(event: FormEvent) {
    event.preventDefault();
    read();
    onContinue();
  }
  return (
    <>
      <form
        id="create-constitution-details"
        ref={form}
        onSubmit={advance}
        onChange={() => requestAnimationFrame(read)}
      >
        <fieldset disabled={disabled} className={styles.basicsFields}>
          <ConstitutionBasicsFields
            countries={countries as CountrySummary[]}
            details={[germany as CountryDetail]}
          />
          <Button type="submit" variant="primary">
            {copy("Continue to structure", "Weiter zur Struktur")}
          </Button>
        </fieldset>
      </form>
      <details className={styles.existing}>
        <summary>
          {copy("Existing constitutions", "Vorhandene Verfassungen")} · 1
        </summary>
        <DataList columns={2}>
          <DataRow
            cells={[
              { label: copy("Country", "Land"), value: "Germany · DE" },
              {
                label: copy("Constitution", "Verfassung"),
                value: (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={onSettings}
                  >
                    {germany.constitutions[0].title}
                  </button>
                ),
              },
            ]}
          />
        </DataList>
      </details>
    </>
  );
}
