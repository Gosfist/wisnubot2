import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
  closeButtonVariant = "icon",
  bodyClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeButtonVariant?: "text" | "icon";
  bodyClassName?: string;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(2,6,23,0.72)] p-5"
      onClick={onClose}
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-auto rounded-[24px] border border-glass-border-blue bg-[rgba(30,41,59,0.98)] p-5 shadow-soft",
          wide ? "max-w-[760px]" : "max-w-[520px]",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-[18px] flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            className={cn(
              "rounded-xl bg-[rgba(148,163,184,0.08)] text-text-secondary transition hover:bg-[rgba(148,163,184,0.14)]",
              closeButtonVariant === "icon" ? "grid size-10 place-items-center" : "px-4 py-3",
            )}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
          >
            {closeButtonVariant === "icon" ? <X size={18} /> : "Tutup"}
          </button>
        </div>
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
