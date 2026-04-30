import { cn } from "../lib/cn";

export function WisnuBotLogo({
  size = 32,
  withContainer = false,
}: {
  size?: number;
  withContainer?: boolean;
}) {
  const content = (
    <svg
      aria-hidden="true"
      className="text-accent"
      viewBox="0 0 100 100"
      width={size}
      height={size}
    >
      <rect x="27" y="10" width="46" height="18" rx="5" fill="currentColor" />
      <rect x="14" y="24" width="72" height="18" rx="5" fill="currentColor" />
      <rect x="3" y="39" width="94" height="32" rx="7" fill="currentColor" />
      <rect x="16" y="62" width="68" height="22" rx="6" fill="currentColor" />
      <circle cx="30" cy="55" r="6.5" fill="#101A43" />
      <circle cx="70" cy="55" r="6.5" fill="#101A43" />
      <rect x="43" y="68" width="14" height="6" rx="2" fill="#101A43" />
    </svg>
  );

  if (!withContainer) {
    return content;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-[22px] bg-[#101A43]",
        "size-11 shadow-[0_0_0_1px_rgba(56,189,248,0.16),0_24px_48px_rgba(37,99,235,0.24)]",
      )}
    >
      {content}
    </div>
  );
}
