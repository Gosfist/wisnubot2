import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "../lib/cn";

export function AuthShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isCompactAuthPage =
    location.pathname === "/login" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/register";

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-linear-to-br from-background via-surface to-[#1e3a8a]",
        "h-dvh min-h-dvh max-h-dvh",
      )}
    >
      <div className="absolute -right-[120px] -top-[120px] size-80 rounded-full bg-[rgba(37,99,235,0.16)] blur-[20px]" />
      <div className="absolute -bottom-[120px] -left-[120px] size-80 rounded-full bg-[rgba(56,189,248,0.1)] blur-[20px]" />
      <div
        className={cn(
          "relative z-[1] flex h-full min-h-0 flex-col items-center justify-center px-6",
          isCompactAuthPage
            ? "h-dvh min-h-dvh max-h-dvh overflow-hidden py-4 sm:py-6"
            : "overflow-y-auto overscroll-y-contain py-10",
        )}
      >
        {children}
      </div>
    </div>
  );
}
