import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OwnerBotConnectModal } from "../../components/OwnerBotConnectModal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";

export function ManageBotsPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingId, setIsSubmittingId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        await appData.refreshBots();
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const sortedBots = useMemo(
    () => [...appData.bots].sort((a, b) => Number(b.id) - Number(a.id)),
    [appData.bots],
  );

  async function handleDeleteBot(botId: number) {
    const confirmed = window.confirm("Yakin ingin hapus bot ini?");
    if (!confirmed) {
      return;
    }

    setIsSubmittingId(botId);
    try {
      const message = await appData.disconnectBot(botId);
      const nextBots = await appData.refreshBots();
      await appData.refreshGroups();

      if (nextBots.some((bot) => Number(bot.id) === Number(botId))) {
        showToast("Bot masih terdeteksi. Coba ulangi hapus bot sekali lagi.", "danger");
        return;
      }

      showToast(message, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menghapus bot", "danger");
    } finally {
      setIsSubmittingId(null);
    }
  }

  function handleAddBot() {
    setShowAddModal(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kelola Bot"
        subtitle="Atur semua bot anda dengan mudah seperti tambah bot baru atau hapus bot yang sudah tidak dipakai."
      />

      <SurfaceCard>
        <div>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={handleAddBot}
          >
            <Plus size={16} />
            Tambah Bot
          </button>
        </div>
      </SurfaceCard>

      {isLoading ? (
        <SurfaceCard className="flex min-h-40 items-center justify-center">
          <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
        </SurfaceCard>
      ) : sortedBots.length === 0 ? (
        null
      ) : (
        <div className="space-y-3">
          {sortedBots.map((bot, index) => {
            const isBusy = isSubmittingId === bot.id;
            return (
              <SurfaceCard key={bot.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold">Bot #{index + 1}</h3>
                    <p className="mt-1 text-sm text-text-secondary">Nomor: {bot.phoneNumber || "-"}</p>
                    <p className="mt-1 text-sm text-text-secondary">Status: {bot.status === "online" ? "Online" : "Offline"}</p>
                  </div>
                </div>

                <div className="grid gap-2 grid-cols-1">
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.12)] px-3 py-2 text-sm font-semibold text-danger transition hover:bg-[rgba(239,68,68,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => handleDeleteBot(bot.id)}
                    disabled={isBusy}
                  >
                    <Trash2 size={15} />
                    Hapus Bot
                  </button>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}

      <OwnerBotConnectModal
        open={showAddModal}
        purpose="broadcast"
        title="Tambah Bot"
        onClose={() => setShowAddModal(false)}
        onConnected={async () => {
          await appData.refreshBots();
          setShowAddModal(false);
        }}
      />
    </div>
  );
}
