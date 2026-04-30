import { Trash2 } from "lucide-react";
import { cn } from "../lib/cn";

export function GroupCard({
  name,
  isActive,
  isBusy,
  onToggle,
  onDelete,
}: {
  name: string;
  isActive: boolean;
  isBusy: boolean;
  onToggle: (nextValue: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-[18px] border border-glass-border bg-[rgba(30,41,59,0.9)]">
      <div className={cn("absolute inset-y-0 left-0 w-1", isActive ? "bg-primary" : "bg-text-muted")} />
      <div className="p-[18px_18px_18px_22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 break-words text-base font-bold">{name}</h3>
            <p className={cn("text-xs font-bold tracking-[0.12em] uppercase", isActive ? "text-accent" : "text-text-muted")}>
              {isActive ? "AKTIF" : "NONAKTIF"}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <label className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={isActive}
                disabled={isBusy}
                className="peer absolute opacity-0"
                onChange={(event) => onToggle(event.target.checked)}
              />
              <span className="relative h-[26px] w-[46px] rounded-full bg-[rgba(100,116,139,0.42)] transition peer-checked:bg-[rgba(37,99,235,0.6)] after:absolute after:top-[3px] after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-[18px]" />
            </label>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(148,163,184,0.08)] text-danger transition hover:bg-[rgba(148,163,184,0.14)]"
              type="button"
              onClick={onDelete}
              disabled={isBusy}
              aria-label="Hapus group"
              title="Hapus"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
