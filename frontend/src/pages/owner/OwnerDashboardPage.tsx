import { useEffect, useState } from "react";
import { Bot, Send, ShieldCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { OwnerBotConnectModal } from "../../components/OwnerBotConnectModal";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import { formatCurrency } from "../../lib/format";

export function OwnerDashboardPage() {
  const navigate = useNavigate();
  const appData = useAppData();
  const { showToast } = useToast();

  const [stats, setStats] = useState<Awaited<ReturnType<typeof appData.getOwnerStats>> | null>(null);
  const [recentUsers, setRecentUsers] = useState<Awaited<ReturnType<typeof appData.listUsers>>>([]);
  const [recentTransactions, setRecentTransactions] = useState<Awaited<ReturnType<typeof appData.getTransactions>>>([]);
  const [ownerBots, setOwnerBots] = useState(appData.bots);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestingBroadcast, setIsTestingBroadcast] = useState(false);
  const [activeConnectModal, setActiveConnectModal] = useState<"broadcast" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      setIsLoading(true);
      const [nextStats, nextUsers, nextTransactions, nextBots] = await Promise.all([
        appData.getOwnerStats(),
        appData.listUsers(),
        appData.getTransactions(),
        appData.refreshBots(),
      ]);

      setStats(nextStats);
      setRecentUsers(nextUsers.slice(0, 3));
      setRecentTransactions(nextTransactions.slice(0, 3));
      setOwnerBots(nextBots);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat dashboard owner.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const broadcastBot = ownerBots[0] ?? null;

  function statusTone(status: string | undefined) {
    return status === "online" ? "text-success" : "text-danger";
  }

  async function handleTestBot(role: "broadcast") {
    const setLoading = setIsTestingBroadcast;

    setLoading(true);
    try {
      const message = await appData.testOwnerBroadcastBot();
      showToast(message, "success");
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal mengetes bot owner.", "danger");
    } finally {
      setLoading(false);
    }
  }

  function renderOwnerBotCard(
    title: string,
    botLabel: string,
    bot: typeof broadcastBot,
    onClick: () => void,
    onTest: () => void,
    isTesting: boolean,
  ) {
    return (
      <SurfaceCard className="flex h-full flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <ShieldCheck size={18} className={statusTone(bot?.status)} />
        </div>
        <p className="text-sm text-text-secondary">
          {bot ? (
            <>
              <span className={statusTone(bot.status)}>{bot.status === "online" ? "Online" : "Offline"}</span>
              {" : "}
              <span>{bot.phoneNumber}</span>
            </>
          ) : (
            `Belum ada ${botLabel.toLowerCase()} owner yang dikonfigurasi`
          )}
        </p>
        <div className={`mt-4 grid gap-3 ${bot ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={onClick}
          >
            <Bot size={16} />
            {bot ? `Ganti ${title}` : `Hubungkan ${title}`}
          </button>

          {bot ? (
            <button
              className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3.5 text-sm font-bold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)] disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onTest}
              disabled={bot.status !== "online" || isTesting}
            >
              <Send size={16} />
              {isTesting ? `Mengetes ${title}...` : `Test ${title}`}
            </button>
          ) : null}
        </div>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Selamat datang, ${appData.user?.name ?? "Owner"}!`}
        subtitle=""
      />

      {isLoading ? (
        null
      ) : error ? (
        <div className="rounded-[20px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.12)] px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <>
          <div className="grid gap-5 xl:grid-cols-1">
            {renderOwnerBotCard(
              "Bot Broadcast",
              "Bot Broadcast",
              broadcastBot,
              () => setActiveConnectModal("broadcast"),
              () => handleTestBot("broadcast"),
              isTestingBroadcast,
            )}
          </div>

          <OwnerBotConnectModal
            open={activeConnectModal === "broadcast"}
            purpose="broadcast"
            title="Hubungkan Bot Broadcast"
            onClose={() => setActiveConnectModal(null)}
            onConnected={loadData}
          />

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-5">
            <StatCard label="Total Users" value={String(stats?.totalUsers ?? 0)} />
            <StatCard label="Bot Aktif" value={String(stats?.activeBots ?? 0)} />
            <StatCard label="Trial User" value={String(stats?.totalTrial ?? 0)} />
            <StatCard label="Premium User" value={String(stats?.totalPremium ?? 0)} />
            <StatCard label="Expired User" value={String(stats?.totalExpired ?? 0)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SurfaceCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">User Terbaru</h3>
            <button
              className="inline-flex items-center gap-2 rounded-[18px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)]"
              type="button"
              onClick={() => navigate("/owner/users")}
            >
              Lihat Semua
            </button>
          </div>

          <div className="space-y-3">
            {recentUsers.length ? (
              recentUsers.map((user) => (
                <div
                  className="flex items-start gap-3 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] p-4"
                  key={user.id}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(37,99,235,0.16)] text-accent">
                    <Users size={16} />
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-sm font-semibold">{user.name}</strong>
                    <p className="mt-1 text-sm text-text-secondary">
                      {user.packageStatus} | WA {user.whatsappNumber}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">Belum ada user</p>
            )}
          </div>
            </SurfaceCard>

            <SurfaceCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Transaksi Terbaru</h3>
            <span className="text-sm text-text-secondary">Rp {formatCurrency(stats?.totalRevenue ?? 0)}</span>
          </div>

          <div className="space-y-3">
            {recentTransactions.length ? (
              recentTransactions.map((transaction) => (
                <div
                  className="flex items-start gap-3 rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] p-4"
                  key={transaction.id}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(34,197,94,0.14)] text-success">
                    <ShieldCheck size={16} />
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-sm font-semibold">{transaction.userName}</strong>
                    <p className="mt-1 text-sm text-text-secondary">
                      +Rp {formatCurrency(transaction.amount)} | {transaction.type}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">Belum ada transaksi</p>
            )}
          </div>
            </SurfaceCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
