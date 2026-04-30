export function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2 rounded-[20px] border border-glass-border bg-[rgba(30,41,59,0.88)] p-[18px] shadow-soft">
      <strong className="font-display text-[1.8rem] font-extrabold">{value}</strong>
      <span className="text-sm text-text-secondary">{label}</span>
    </div>
  );
}
