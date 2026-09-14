"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { parseQuantityEntry, type FoundUpdate } from "@/lib/part-search";

export function Counter({ found, quantity, onChange, name = "part" }: {
  found: number;
  quantity: number;
  onChange: (value: FoundUpdate) => void;
  name?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const helpId = useId();
  const editingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancel = () => { editingRef.current = false; setEditing(false); setInvalid(false); };
  const commit = () => {
    if (!editingRef.current) return;
    const update = parseQuantityEntry(draft);
    if (update === null) { setInvalid(true); return; }
    editingRef.current = false;
    onChange(update);
    setEditing(false);
    setInvalid(false);
  };
  return (
    <div className={`quantity-control${editing ? " is-editing" : ""}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div className="counter" role="group" aria-label={`${name}: ${found} of ${quantity} found`}>
        <button type="button" aria-label={editing ? "Cancel quantity edit" : `Subtract one ${name}`} disabled={!editing && found <= 0} onMouseDown={(event) => { if (editing) event.preventDefault(); }} onClick={() => editing ? cancel() : onChange({ delta: -1 })}><Icon name={editing ? "close" : "minus"} /></button>
        {editing ? (
          <input
            className="quantity-input" type="text" inputMode="text" autoFocus
            aria-label={`Set ${name} found total or enter +amount`}
            aria-describedby={helpId} aria-invalid={invalid}
            value={draft} onFocus={(event) => event.target.select()}
            onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") { event.preventDefault(); commit(); }
              if (event.key === "Escape") { event.preventDefault(); cancel(); triggerRef.current?.focus(); }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.closest(".counter")?.contains(event.relatedTarget as Node | null)) {
                if (parseQuantityEntry(draft) !== null) commit();
                else cancel();
              }
            }}
          />
        ) : (
          <button ref={triggerRef} type="button" className="quantity-total" aria-label={`Edit ${name} quantity. ${found} of ${quantity} found. Enter a total or +amount.`} title="Click to set a total, or enter +5 to add five" onClick={() => { setDraft(String(found)); setEditing(true); editingRef.current = true; }}>
            <strong>{found}<span> / {quantity}</span></strong>
          </button>
        )}
        <button type="button" aria-label={editing ? "Save quantity" : `Add one ${name}`} disabled={!editing && found >= quantity} onMouseDown={(event) => { if (editing) event.preventDefault(); }} onClick={() => editing ? commit() : onChange({ delta: 1 })}><Icon name={editing ? "check" : "plus"} /></button>
      </div>
      {editing && <small id={helpId} className={`quantity-hint${invalid ? " invalid" : ""}`}>{invalid ? "Enter a whole number or +amount" : `Total or +amount · maximum ${quantity}`}</small>}
    </div>
  );
}
