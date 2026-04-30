import type { PackageStatus } from "../types/models";
import { getPackageStatusLabel } from "../lib/access";
import { cn } from "../lib/cn";

export function TierBadge({ status }: { status: PackageStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-2 text-xs font-bold",
        status === "owner"
          ? "bg-[rgba(168,85,247,0.16)] text-[rgb(216,180,254)]"
          : status === "premium"
            ? "bg-[rgba(245,158,11,0.16)] text-warning"
            : status === "expired"
              ? "bg-[rgba(239,68,68,0.16)] text-danger"
              : "bg-[rgba(37,99,235,0.16)] text-accent",
      )}
    >
      {getPackageStatusLabel(status)}
    </span>
  );
}
