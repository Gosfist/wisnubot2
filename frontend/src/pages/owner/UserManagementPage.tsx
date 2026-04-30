import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Search } from "lucide-react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import { getPackageStatusLabel } from "../../lib/access";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import type { ManagedUserModel, PremiumOptionModel } from "../../types/models";

const filters = ["Semua", "Trial", "Premium", "Expired"] as const;

export function UserManagementPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [users, setUsers] = useState<ManagedUserModel[]>([]);
  const [premiumOptions, setPremiumOptions] = useState<PremiumOptionModel[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("Semua");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeTarget, setUpgradeTarget] = useState<ManagedUserModel | null>(null);
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  function updateListMaxHeight() {
    if (!listContainerRef.current) {
      return;
    }

    const topOffset = listContainerRef.current.getBoundingClientRect().top;
    const nextMaxHeight = Math.max(160, window.innerHeight - topOffset - 12);
    setListMaxHeight(nextMaxHeight);
  }

  async function loadUsers() {
    try {
      setIsLoading(true);
      const [result, config] = await Promise.all([appData.listUsers(), appData.getLimits()]);
      setUsers(result);
      setPremiumOptions(config.premiumOptions);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat user.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateListMaxHeight();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [users.length, filter, search, isLoading, error]);

  useEffect(() => {
    window.addEventListener("resize", updateListMaxHeight);
    return () => {
      window.removeEventListener("resize", updateListMaxHeight);
    };
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchFilter =
        filter === "Semua" ||
        (filter === "Trial" && user.packageStatus === "trial") ||
        (filter === "Premium" && user.packageStatus === "premium") ||
        (filter === "Expired" && user.packageStatus === "expired");

      const query = search.toLowerCase();
      const matchSearch =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.whatsappNumber.toLowerCase().includes(query);

      return matchFilter && matchSearch;
    });
  }, [filter, search, users]);

  async function handleSuspend(user: ManagedUserModel) {
    try {
      await appData.suspendUser(user.id, user.isActive);
      await loadUsers();
      showToast(
        user.isActive ? `User ${user.name} di-suspend` : `User ${user.name} diaktifkan kembali`,
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal mengubah status user.", "danger");
    }
  }

  async function handleUpgrade(packageType: string) {
    if (!upgradeTarget) {
      return;
    }

    try {
      await appData.updateUserPackage(upgradeTarget.id, packageType);
      await loadUsers();
      showToast(`${upgradeTarget.name} berhasil di-upgrade`, "success");
      setUpgradeTarget(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal upgrade user.", "danger");
    }
  }

  async function handleDelete(user: ManagedUserModel) {
    const confirmed = window.confirm(`Yakin ingin menghapus user ${user.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      await appData.deleteUser(user.id);
      await loadUsers();
      showToast(`${user.name} berhasil dihapus`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gagal menghapus user.", "danger");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Kelola User" subtitle="Suspend, upgrade premium, dan hapus user dari panel owner." />

      <SurfaceCard>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 rounded-[20px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.56)] px-4 py-3 text-text-secondary xl:min-w-[320px] xl:flex-1">
            <Search size={18} />
            <input
              className="w-full border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-muted focus:border-0 focus:ring-0"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari user..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  filter === item
                    ? "border-[rgba(56,189,248,0.34)] bg-[rgba(37,99,235,0.18)] text-accent"
                    : "border-[rgba(148,163,184,0.16)] text-text-secondary hover:border-[rgba(56,189,248,0.24)] hover:text-text-primary",
                )}
                type="button"
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </SurfaceCard>

      {isLoading ? (
        <SurfaceCard className="flex min-h-40 items-center justify-center">
          <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
        </SurfaceCard>
      ) : error ? (
        <div className="rounded-[20px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.12)] px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : filteredUsers.length === 0 ? (
        <SurfaceCard className="py-12 text-center text-text-secondary">Tidak ada user ditemukan.</SurfaceCard>
      ) : (
        <div
          ref={listContainerRef}
          className="overflow-y-auto overscroll-y-contain pr-1"
          style={listMaxHeight ? { maxHeight: `${listMaxHeight}px` } : undefined}
        >
          <div className="grid gap-4">
            {filteredUsers.map((user) => (
              <SurfaceCard key={user.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{user.name}</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      WA {user.whatsappNumber} | {getPackageStatusLabel(user.packageStatus)}
                    </p>
                    {user.packageExpiresAt ? (
                      <p className="mt-2 text-sm text-accent">Aktif sampai {formatDate(user.packageExpiresAt)}</p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-3 py-1 text-xs font-bold tracking-[0.12em] uppercase",
                      user.packageStatus === "premium"
                        ? "border-[rgba(251,191,36,0.18)] bg-[rgba(251,191,36,0.12)] text-warning"
                        : user.packageStatus === "expired"
                          ? "border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.12)] text-danger"
                          : "border-[rgba(56,189,248,0.18)] bg-[rgba(37,99,235,0.12)] text-accent",
                    )}
                  >
                    {getPackageStatusLabel(user.packageStatus)}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-semibold transition",
                      user.isActive
                        ? "border-[rgba(239,68,68,0.2)] text-danger hover:bg-[rgba(239,68,68,0.1)]"
                        : "border-[rgba(34,197,94,0.2)] text-success hover:bg-[rgba(34,197,94,0.1)]",
                    )}
                    type="button"
                    onClick={() => handleSuspend(user)}
                  >
                    {user.isActive ? "Suspend" : "Aktifkan"}
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-[18px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)]"
                    type="button"
                    onClick={() => setUpgradeTarget(user)}
                  >
                    <Crown size={16} />
                    {user.packageStatus === "premium" ? "Perpanjang" : "Upgrade"}
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-[18px] border border-[rgba(239,68,68,0.2)] px-4 py-3 text-sm font-semibold text-danger transition hover:bg-[rgba(239,68,68,0.1)]"
                    type="button"
                    onClick={() => handleDelete(user)}
                  >
                    Delete
                  </button>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </div>
      )}

      <Modal open={Boolean(upgradeTarget)} title="Pilih Paket Premium" onClose={() => setUpgradeTarget(null)}>
        <div className="space-y-3">
          {premiumOptions.map((option) => (
            <button
              key={option.id}
              className="flex w-full items-center justify-center rounded-[20px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3.5 text-sm font-semibold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)]"
              type="button"
              onClick={() => handleUpgrade(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
