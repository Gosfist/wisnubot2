export function LimitBar({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number;
}) {
  const isUnlimited = max <= 0;
  const safeMax = Math.max(max, 1);
  const width = isUnlimited ? 100 : Math.min((current / safeMax) * 100, 100);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm text-text-secondary">
        <span>{label}</span>
        <strong className="text-text-primary">
          {isUnlimited ? `${current}/∞` : `${current}/${safeMax}`}
        </strong>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(148,163,184,0.16)]">
        <div
          className="h-full rounded-full bg-linear-to-r from-primary to-accent"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
