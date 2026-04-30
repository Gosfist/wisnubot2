import { useEffect, useState } from "react";
import { Bell, Bolt, PlusCircle, RefreshCw } from "lucide-react";
import { OwnerBotConnectModal } from "../../components/OwnerBotConnectModal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import { socketService } from "../../lib/socket";

export function DashboardPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(!appData.bots.length);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  async function loadData(silent = false) {
    try {
      if (!silent) setIsLoading(true);
      await appData.refreshBots();
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat dashboard.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!appData.bots.length) {
      loadData();
      return;
    }
    setIsLoading(false);
  }, [appData.bots.length]);

  useEffect(() => {
    let mounted = true;
    socketService.connect().catch(() => undefined);
    const unsubscribe = socketService.onBotStatus(async () => {
      if (!mounted) return;
      await appData.refreshBots();
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function handleTestBot() {
    setIsTesting(true);
    try {
      const message = await appData.testUserBot();
      showToast(message, "success");
    } catch (nextError) {
      showToast(
        nextError instanceof Error ? nextError.message : "Gagal mengetes bot.",
        "danger",
      );
    } finally {
      setIsTesting(false);
    }
  }

  const bot = appData.bots[0] ?? null;

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" />

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.12)] px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(239,68,68,0.24)] px-3 py-2 font-semibold text-danger transition hover:bg-[rgba(239,68,68,0.12)]"
            type="button"
            onClick={() => loadData()}
          >
            <RefreshCw size={14} />
            Coba Lagi
          </button>
        </div>
      ) : null}

      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Bot</h3>
          <button
            className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.2)] bg-[rgba(37,99,235,0.12)] px-3 py-2 text-sm font-semibold text-accent transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(37,99,235,0.2)]"
            type="button"
            onClick={() => setShowConnectModal(true)}
          >
            <PlusCircle size={15} />
            {bot ? "Ganti Bot" : "Tambah Bot"}
          </button>
        </div>

        {isLoading ? (
          <div className="flex min-h-24 items-center justify-center">
            <div className="size-8 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : bot ? (
          <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] px-4 py-4">
            <div className="flex items-center gap-3">
              <div
                className={
                  bot.status === "online"
                    ? "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(34,197,94,0.16)] text-success"
                    : "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(148,163,184,0.12)] text-text-secondary"
                }
              >
                <Bolt size={16} />
              </div>
              <div>
                <strong className="block text-sm font-semibold">{bot.phoneNumber}</strong>
                <span className="text-xs text-text-secondary capitalize">{bot.status}</span>
              </div>
            </div>
            {bot.status === "online" && (
              <button
                className="rounded-[14px] border border-[rgba(56,189,248,0.2)] bg-[rgba(37,99,235,0.12)] px-3 py-2 text-xs font-semibold text-accent transition hover:bg-[rgba(37,99,235,0.2)] disabled:opacity-60"
                type="button"
                onClick={handleTestBot}
                disabled={isTesting}
              >
                {isTesting ? "Testing..." : "Test Bot"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            Belum ada bot. <button type="button" className="text-accent hover:underline" onClick={() => setShowConnectModal(true)}>Tambahkan bot</button> untuk mulai menggunakan fitur broadcast.
          </p>
        )}
      </SurfaceCard>

      <SurfaceCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Aktivitas</h3>
          <Bell size={18} className="text-accent" />
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] p-4">
            <div
              className={
                bot?.status === "online"
                  ? "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(34,197,94,0.16)] text-success"
                  : "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(37,99,235,0.16)] text-accent"
              }
            >
              <Bolt size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block text-sm font-semibold">
                {bot?.status === "online" ? "Bot Online & Aktif" : "Bot Offline"}
              </strong>
              <p className="mt-1 text-sm text-text-secondary">{bot?.phoneNumber ?? "Belum ada bot"}</p>
            </div>
            <span className="text-xs font-medium text-text-muted">Sekarang</span>
          </div>
        </div>
      </SurfaceCard>
      <OwnerBotConnectModal
        open={showConnectModal}
        purpose="broadcast"
        title={bot ? "Ganti Bot" : "Tambahkan Bot"}
        onClose={() => setShowConnectModal(false)}
        onConnected={async () => {
          await loadData(true);
          setShowConnectModal(false);
        }}
      />
    </div>
  );
}
