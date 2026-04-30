import { SurfaceCard } from "../components/SurfaceCard";

export function FeatureAccessPage({
  title,
  description,
  lockedMessage,
}: {
  title: string;
  description: string;
  lockedMessage?: string | null;
}) {
  if (lockedMessage) {
    return (
      <SurfaceCard className="grid min-h-[280px] place-content-center gap-3 text-center">
        <h2 className="text-2xl font-bold">{lockedMessage}</h2>
        <p className="max-w-md text-text-secondary">
          {lockedMessage === "Akun anda exp"
            ? "Perpanjang paket akun Anda untuk membuka fitur ini kembali."
            : "Upgrade ke premium untuk membuka fitur ini."}
        </p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="grid min-h-[280px] place-content-center gap-3 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="max-w-md text-text-secondary">{description}</p>
    </SurfaceCard>
  );
}
