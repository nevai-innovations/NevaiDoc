"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem =
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | "separator";

/** Small accessible dropdown: click or Enter to open, arrows to move, Esc to close. */
export default function Menu({
  trigger,
  label,
  items,
  align = "right",
  triggerClassName,
}: {
  trigger: ReactNode;
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
  triggerClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("[data-menu-trigger]")?.focus();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        data-menu-trigger
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          className={`nv-pop-in absolute z-30 mt-1 min-w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) =>
            item === "separator" ? (
              <div key={i} className="my-1 border-t border-line" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm focus:outline-none disabled:opacity-40 ${
                  item.danger ? "text-red-600 hover:bg-red-50 focus:bg-red-50" : "text-slate-700 hover:bg-slate-50 focus:bg-slate-50"
                }`}
              >
                {item.icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
