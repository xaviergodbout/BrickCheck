"use client";

import { useEffect, useRef, type ReactNode } from "react";

const openModals: HTMLElement[] = [];
let originalOverflow = "";

/** Keep nested dialogs keyboard-contained, and return focus to their opener. */
export function Modal({ children, onClose, busy = false, topLayer = false }: {
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  topLayer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const root = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!openModals.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModals.push(root);
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.tabIndex = -1;
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
    )).filter((node) => node.getClientRects().length > 0);
    const first = root.querySelector<HTMLElement>('input:not(:disabled):not([type="hidden"]), textarea') ?? focusables()[0] ?? dialog;
    if (!root.contains(document.activeElement)) first.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (openModals.at(-1) !== root) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === "Tab") {
        const nodes = focusables();
        const firstNode = nodes[0] ?? dialog;
        const lastNode = nodes.at(-1) ?? dialog;
        if (!nodes.length || !root.contains(document.activeElement) || (event.shiftKey && (document.activeElement === firstNode || document.activeElement === dialog))) {
          event.preventDefault();
          (event.shiftKey ? lastNode : firstNode).focus();
        } else if (!event.shiftKey && document.activeElement === lastNode) {
          event.preventDefault();
          firstNode.focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (openModals.at(-1) === root && !root.contains(event.target as Node)) dialog.focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      openModals.splice(openModals.indexOf(root), 1);
      if (!openModals.length) document.body.style.overflow = originalOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={ref} className={`modal-backdrop${topLayer ? " top-layer" : ""}`} role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>{children}</div>;
}
