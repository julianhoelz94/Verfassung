"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./HelpTooltip.module.css";

/** Pointer, keyboard and touch share one explanation, positioned inside the viewport. */
export function HelpTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !box.current) return;
    const anchor = trigger.current.getBoundingClientRect(),
      rect = box.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.left, window.innerWidth - rect.width - 8),
      ),
      top:
        anchor.bottom + rect.height + 8 < window.innerHeight
          ? anchor.bottom + 6
          : Math.max(8, anchor.top - rect.height - 6),
    });
  }, [open, label]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !box.current?.contains(event.target)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={styles.trigger}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onPointerOver={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onPointerLeave={() => {
          if (document.activeElement !== trigger.current) setOpen(false);
        }}
        onFocus={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <span
              role="tooltip"
              id={id}
              ref={box}
              className={styles.tooltip}
              style={position}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
