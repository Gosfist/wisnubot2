import { useEffect, useMemo, useState } from "react";
import { Crown, MessageCircle, Rocket, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";

export function UpgradePage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [limits, setLimits] = useState<Awaited<ReturnType<typeof appData.getLimits>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPackageId, setLoadingPackageId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([appData.getLimits(), appData.user ? Promise.resolve(appData.user) : appData.refreshUser()])
      .then(([result]) => {
        if (!mounted) {
          return;
        }
        setLimits(result);
      })
      .catch((nextError) => {
        if (!mounted) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Gagal memuat paket.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const currentStatus = appData.user?.packageStatus ?? "trial";
  const ownerWaLink = useMemo(() => {
    const digits = limits?.ownerNumber.replace(/[^\d]/g, "") ?? "";
    return digits ? `https://wa.me/${digits}` : null;
  }, [limits?.ownerNumber]);

  async function handleCheckout(packageType: string) {
    setLoadingPackageId(packageType);
    try {
      const response = await appData.startPremiumCheckout(packageType);
      showToast(response.message, "info");
      if (ownerWaLink) {
        window.open(ownerWaLink, "_blank", "noopener,noreferrer");
      }
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal memulai checkout premium.", "danger");
    } finally {
      setLoadingPackageId(null);
    }
  }

  function handleContactOwner() {
    if (!ownerWaLink) {
      showToast("Nomor owner belum tersedia.", "danger");
      return;
    }
    window.open(ownerWaLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Upgrade Premium"
        subtitle="Trial 3 hari hanya untuk broadcast. Premium membuka broadcast, push kontak, dan customer service."
      />

      {error ? (
        <div className="rounded-[20px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.12)] px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {!limits && !error ? (
        null
      ) : limits ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <SurfaceCard className="flex h-full flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-[rgba(37,99,235,0.16)] text-accent">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">TRIAL 3 HARI</h3>
                    <p className="mt-1 text-sm text-text-secondary">Fitur: broadcast</p>
                  </div>
                </div>
                {currentStatus === "trial" ? (
                  <span className="rounded-full border border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.14)] px-3 py-1 text-xs font-bold tracking-[0.12em] text-success uppercase">
                    Paket Aktif
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-[18px] border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] px-4 py-3">
                  <Rocket size={15} className="text-accent" />
                  <span className="text-sm text-text-primary">Broadcast aktif</span>
                </div>
                <div className="flex items-center gap-3 rounded-[18px] border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] px-4 py-3">
                  <Rocket size={15} className="text-accent" />
                  <span className="text-sm text-text-primary">Jadwal auto broadcast tanpa batas</span>
                </div>
                <div className="flex items-center gap-3 rounded-[18px] border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] px-4 py-3">
                  <Rocket size={15} className="text-accent" />
                  <span className="text-sm text-text-primary">Broadcast aktif tanpa batas</span>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard className="flex h-full flex-col gap-5 border-[rgba(251,191,36,0.16)] bg-linear-to-br from-[rgba(251,191,36,0.08)] via-[rgba(30,41,59,0.88)] to-[rgba(15,23,42,0.94)]">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-[rgba(251,191,36,0.14)] text-warning">
                  <Crown size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">PREMIUM</h3>
                  <p className="mt-1 text-sm text-text-secondary">Broadcast, Push Kontak, Customer Service</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  "Broadcast aktif",
                  "Push Kontak",
                  "Customer Service",
                  "Jadwal auto broadcast tanpa batas",
                  "Broadcast aktif tanpa batas",
                ].map((feature) => (
                  <div
                    className="flex items-center gap-3 rounded-[18px] border border-[rgba(251,191,36,0.14)] bg-[rgba(15,23,42,0.44)] px-4 py-3"
                    key={feature}
                  >
                    <Rocket size={15} className="text-warning" />
                    <span className="text-sm text-text-primary">{feature}</span>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {limits.premiumOptions.map((option) => (
              <SurfaceCard key={option.id} className="flex h-full flex-col gap-4">
                <div>
                  <h3 className="text-lg font-bold">{option.label}</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Stub checkout via {limits.paymentGateway.provider} sudah disiapkan.
                  </p>
                </div>
                <button
                  className="mt-auto flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={currentStatus === "owner" || loadingPackageId === option.id}
                  onClick={() => handleCheckout(option.id)}
                >
                  <MessageCircle size={16} />
                  {loadingPackageId === option.id ? "MEMPROSES..." : `PILIH ${option.days} HARI`}
                </button>
              </SurfaceCard>
            ))}
          </div>
        </>
      ) : null}

      <div className="rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.58)] px-4 py-3 text-sm text-text-secondary">
        Checkout premium baru tahap stub. Saat ini tombol akan menyimpan transaksi pending dan mengarahkan Anda untuk hubungi owner.
      </div>

      <button
        className="inline-flex items-center gap-2 rounded-[18px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)]"
        type="button"
        onClick={handleContactOwner}
      >
        <MessageCircle size={16} />
        Hubungi Owner
      </button>
    </div>
  );
}
