import { useEffect, useState } from "react";
import { Bell, Bolt, PlusCircle, RefreshCw } from "lucide-react";
import { OwnerBotConnectModal } from "../../components/OwnerBotConnectModal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import { socketService } from "../../lib/socket";
import type { ActivityLogModel } from "../../types/models";

export function DashboardPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(!appData.bots.length);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLogModel[]>([]);

  async function refreshActivityLogs() {
    try {
      const logs = await appData.fetchActivityLogs();
      setActivityLogs(logs);
    } catch {
      // Keep the last visible logs if a refresh fails briefly.
    }
  }

  async function loadData(silent = false) {
    try {
      if (!silent) setIsLoading(true);
      const [logsResult, botsResult] = await Promise.allSettled([
        appData.fetchActivityLogs(),
        appData.refreshBots(),
      ]);
      if (logsResult.status === "fulfilled") {
        setActivityLogs(logsResult.value);
      }
      if (botsResult.status === "rejected") {
        throw botsResult.reason;
      }
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat dashboard.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData(Boolean(appData.bots.length));
  }, []);

  useEffect(() => {
    let mounted = true;
    socketService.connect().catch(() => undefined);
    const unsubscribe = socketService.onBotStatus(async () => {
      if (!mounted) return;
      await appData.refreshBots();
      if (mounted) await refreshActivityLogs();
    });
    const intervalId = window.setInterval(() => {
      if (mounted) void refreshActivityLogs();
    }, 10000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
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

  function getActivityPresentation(item: ActivityLogModel) {
    if (item.action === "bot_connected") {
      return {
        detail: item.detail.replace(/^Bot terhubung/i, "Bot connect"),
        iconClass: "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(37,99,235,0.16)] text-accent",
        cardClass: "flex items-start gap-3 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] p-4",
      };
    }

    if (item.action === "bot_disconnected") {
      return {
        detail: item.detail.replace(/^Bot disconnect/i, "Bot disconnect"),
        iconClass: "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(37,99,235,0.16)] text-accent",
        cardClass: "flex items-start gap-3 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] p-4",
      };
    }

    return {
      detail: item.detail,
      iconClass: "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(37,99,235,0.16)] text-accent",
      cardClass: "flex items-start gap-3 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] p-4",
    };
  }

  const bot = appData.bots[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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

      <SurfaceCard className="shrink-0 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={
                bot?.status === "online"
                  ? "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(34,197,94,0.16)] text-success"
                  : "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(148,163,184,0.12)] text-text-secondary"
              }
            >
              <Bolt size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold">Bot</h3>
                {bot ? (
                  <span
                    className={
                      bot.status === "online"
                        ? "rounded-full bg-[rgba(34,197,94,0.12)] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] text-success"
                        : "rounded-full bg-[rgba(148,163,184,0.12)] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] text-text-secondary"
                    }
                  >
                    {bot.status}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-semibold text-white">{bot?.phoneNumber ?? "Belum ada bot"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {bot?.status === "online" ? (
              <button
                className="rounded-[14px] border border-[rgba(56,189,248,0.2)] bg-[rgba(37,99,235,0.12)] px-3 py-2 text-xs font-semibold text-accent transition hover:bg-[rgba(37,99,235,0.2)] disabled:opacity-60"
                type="button"
                onClick={handleTestBot}
                disabled={isTesting}
              >
                {isTesting ? "Testing..." : "Test Bot"}
              </button>
            ) : null}
          <button
            className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.2)] bg-[rgba(37,99,235,0.12)] px-3 py-2 text-sm font-semibold text-accent transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(37,99,235,0.2)]"
            type="button"
            onClick={() => setShowConnectModal(true)}
          >
            <PlusCircle size={15} />
            {bot ? "Ganti Bot" : "Tambah Bot"}
          </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-3 flex min-h-16 items-center justify-center rounded-[16px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)]">
            <div className="size-8 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : !bot ? (
          <p className="mt-3 rounded-[16px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] px-4 py-3 text-sm text-text-secondary">
            Belum ada bot. <button type="button" className="text-accent hover:underline" onClick={() => setShowConnectModal(true)}>Tambahkan bot</button> untuk mulai menggunakan fitur broadcast.
          </p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Log Aktivitas</h3>
            <p className="mt-1 text-xs text-text-secondary">Riwayat bot, broadcast, push kontak, dan perubahan sistem.</p>
          </div>
          <Bell size={18} className="text-accent" />
        </div>
        <div className="clean-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
          {activityLogs.length === 0 ? (
            <div className="rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] px-4 py-5 text-sm text-text-secondary">
              Belum ada activity log.
            </div>
          ) : null}
          {activityLogs.slice(0, 20).map((item) => {
            const presentation = getActivityPresentation(item);
            return (
              <div key={item.id} className={presentation.cardClass}>
                <div className={presentation.iconClass}>
                  <Bell size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold">{presentation.detail}</strong>
                  <p className="mt-1 text-xs text-text-secondary">{item.action}</p>
                </div>
                <span className="text-xs font-medium text-text-muted">
                  {item.createdAt ? new Date(item.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                </span>
              </div>
            );
          })}
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
