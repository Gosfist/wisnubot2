import { cn } from "../lib/cn";
import type { ReactNode } from "react";

export function SurfaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[20px] border border-glass-border bg-[rgba(30,41,59,0.88)] p-5 shadow-soft",
        className,
      )}
    >
      {children}
    </section>
  );
}
