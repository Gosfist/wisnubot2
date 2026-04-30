export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-60 place-content-center gap-2.5 rounded-[20px] border border-glass-border bg-[rgba(30,41,59,0.88)] p-5 text-center shadow-soft">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-text-secondary">{description}</p>
    </div>
  );
}
