import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { BroadcastCard } from "../../components/BroadcastCard";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { apiFetch } from "../../lib/http";

interface BroadcastListLocationState {
  checkBroadcastNameChanges?: boolean;
}

const ITEMS_PER_PAGE = 5;

export function BroadcastsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const appData = useAppData();
  const auth = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(!appData.broadcasts.length || !appData.user);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const baseBroadcastPath = "/broadcasts";

  function buildNameSignature() {
    return [...appData.broadcasts]
      .sort((a, b) => a.id - b.id)
      .map((item) => `${item.id}:${item.title}`)
      .join("|");
  }

  async function hasBroadcastNameChanges() {
    try {
      const response = await apiFetch<{ signature?: string }>("/broadcasts/name-signature");
      return String(response.signature ?? "") !== buildNameSignature();
    } catch {
      return true;
    }
  }

  async function loadData() {
    const locationState = (location.state as BroadcastListLocationState | null) ?? null;
    const shouldCheckNameChanges = Boolean(locationState?.checkBroadcastNameChanges);

    try {
      setIsLoading(true);

      if (!appData.user) {
        await appData.refreshUser();
      }

      if (!appData.broadcasts.length) {
        await appData.refreshBroadcasts();
      } else if (shouldCheckNameChanges) {
        const hasChanges = await hasBroadcastNameChanges();
        if (hasChanges) {
          await appData.refreshBroadcasts();
        }
      }

      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat broadcast.");
    } finally {
      setIsLoading(false);
      if (shouldCheckNameChanges) {
        navigate(location.pathname, { replace: true, state: null });
      }
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(appData.broadcasts.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [appData.broadcasts.length, currentPage]);

  const totalPages = Math.max(1, Math.ceil(appData.broadcasts.length / ITEMS_PER_PAGE));
  const paginatedBroadcasts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return appData.broadcasts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [appData.broadcasts, currentPage]);

  async function handleDelete(id: number, title: string) {
    const confirmed = window.confirm(`Yakin ingin menghapus broadcast "${title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      const message = await appData.deleteBroadcast(id);
      await appData.refreshBroadcasts();
      await appData.refreshBots();
      showToast(message, "success");
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal menghapus broadcast.", "danger");
    }
  }

  async function handleToggleActive(id: number, nextValue: boolean) {
    if (togglingId === id) {
      return;
    }

    try {
      setTogglingId(id);
      await appData.updateBroadcast(id, { isActive: nextValue });
      await appData.refreshBroadcasts();
      showToast(nextValue ? "Broadcast diaktifkan." : "Broadcast dinonaktifkan.", "success");
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal mengubah status broadcast.", "danger");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Broadcast"

        actions={
          <button
            className="inline-flex w-auto items-center justify-center gap-2 rounded-[16px] bg-linear-to-r from-primary to-accent px-4 py-2.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={() => navigate(`${baseBroadcastPath}/add`)}
          >
            <Plus size={16} />
            Tambah
          </button>
        }
      />

      {isLoading ? (
        <SurfaceCard className="flex min-h-40 items-center justify-center">
          <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
        </SurfaceCard>
      ) : error ? (
        <div className="rounded-[20px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.12)] px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : appData.broadcasts.length === 0 ? (
        <SurfaceCard>
          <div className="px-5 py-6 text-sm text-text-secondary">
            Belum ada data broadcast.
          </div>
        </SurfaceCard>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {paginatedBroadcasts.map((broadcast) => (
              <BroadcastCard
                key={broadcast.id}
                title={broadcast.title}
                isActive={broadcast.isActive}
                isBusy={togglingId === broadcast.id}
                onEdit={() => navigate(`${baseBroadcastPath}/add`, { state: { editData: broadcast } })}
                onToggleActive={(nextValue) => handleToggleActive(broadcast.id, nextValue)}
                onDelete={() => handleDelete(broadcast.id, broadcast.title)}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                className="rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  className={`rounded-[16px] px-4 py-2 text-sm font-semibold transition ${page === currentPage
                      ? "bg-linear-to-r from-primary to-accent text-white shadow-glow"
                      : "border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] text-text-primary hover:border-[rgba(56,189,248,0.32)]"
                    }`}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}

              <button
                className="rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
