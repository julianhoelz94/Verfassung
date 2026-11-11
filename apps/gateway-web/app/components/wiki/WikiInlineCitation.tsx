"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { WikiInlineReference } from "../../../lib/wiki-document";
import { useTranslation } from "../TranslationProvider";
import styles from "./WikiInlineCitation.module.css";

export function WikiInlineCitation({
  reference,
  number,
  title,
}: {
  reference: WikiInlineReference;
  number: number;
  title: string;
}) {
  const t = useTranslation(),
    copy = (en: string, de: string) => t({ en, de });
  const [open, setOpen] = useState(false),
    id = useId();
  const trigger = useRef<HTMLButtonElement>(null),
    details = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const panel = details.current;
    if (!open || !panel || !trigger.current) return;
    panel.showPopover();
    const anchor = trigger.current.getBoundingClientRect(),
      box = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8))}px`;
    panel.style.top = `${anchor.bottom + box.height + 8 < window.innerHeight ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6)}px`;
    return () => {
      if (panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !details.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function escape(event: KeyboardEvent<HTMLElement>) {
    if (open && event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }
  return (
    <>
      <sup className={styles.reference}>
        <button
          type="button"
          ref={trigger}
          aria-label={`${copy("Citation", "Beleg")} ${number}: ${title}${reference.locator ? ` · ${reference.locator}` : ""}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          onKeyDown={escape}
        >
          [{number}]
        </button>
      </sup>
      {open ? (
        <span
          id={id}
          popover="manual"
          ref={details}
          className={styles.details}
          role="dialog"
          onToggle={(event) => {
            if (event.newState === "closed") setOpen(false);
          }}
          aria-label={copy("Cited source", "Zitierte Quelle")}
          onKeyDown={escape}
        >
          <strong>{title}</strong>
          <span>
            {copy("Revision", "Revision")} {reference.revision}
          </span>
          {reference.locator ? <span>{reference.locator}</span> : null}
          <span className={styles.actions}>
            <a
              href={`/documents/${reference.documentId}?revision=${reference.revision}`}
            >
              {copy("Open document", "Dokument öffnen")}
            </a>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {copy("Close", "Schließen")}
            </button>
          </span>
        </span>
      ) : null}
    </>
  );
}
