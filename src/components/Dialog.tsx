import { useEffect, useRef, type ReactNode } from "react";

/** Thin wrapper over the native <dialog>: focus trap, Esc and backdrop for free. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** For bigger forms, e.g. the character builder. */
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto ${wide ? "w-[min(64rem,calc(100vw-2rem))]" : "w-[min(40rem,calc(100vw-2rem))]"} rounded-lg border border-line bg-surface p-0 text-text shadow-2xl`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-2xl font-bold text-accent">{title}</h3>
            <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
