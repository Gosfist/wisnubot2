import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { GroupCard } from "../../components/GroupCard";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { apiFetch } from "../../lib/http";

export function GroupsPage() {
  const appData = useAppData();
  const auth = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(!appData.groups.length || !appData.user);
  const [error, setError] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [togglingGroupIds, setTogglingGroupIds] = useState<string[]>([]);
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const isOwner = true;

  function updateListMaxHeight() {
    if (!listContainerRef.current) {
      return;
    }

    const topOffset = listContainerRef.current.getBoundingClientRect().top;
    const nextMaxHeight = Math.max(160, window.innerHeight - topOffset - 12);
    setListMaxHeight(nextMaxHeight);
  }

  async function loadGroups() {
    try {
      setIsLoading(true);
      await Promise.all([
        appData.refreshGroups(),
        appData.user ? Promise.resolve(appData.user) : appData.refreshUser(),
      ]);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat group.");
    } finally {
      setIsLoading(false);
    }
  }

  async function syncGroupsSilently() {
    try {
      await apiFetch<{ message?: string }>("/groups/sync", {
        method: "POST",
      });
      await appData.refreshGroups();
    } catch {
      // Best effort: skip toast supaya UX tetap tenang kalau bot offline/sync gagal sementara.
    }
  }

  useEffect(() => {
    loadGroups();
    syncGroupsSilently();
  }, []);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateListMaxHeight();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [appData.groups.length, isLoading, error]);

  useEffect(() => {
    window.addEventListener("resize", updateListMaxHeight);
    return () => {
      window.removeEventListener("resize", updateListMaxHeight);
    };
  }, []);

  async function handleJoinGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteLink.trim()) {
      showToast("Masukkan invite link group dulu.", "danger");
      return;
    }

    setIsJoining(true);
    try {
      await appData.joinGroup(inviteLink);
      await appData.refreshGroups();
      await appData.refreshBots();
      setInviteLink("");
      setShowJoinModal(false);
      showToast("Group berhasil ditambahkan.", "success");
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal join group.", "danger");
    } finally {
      setIsJoining(false);
    }
  }

  async function handleToggle(groupId: string, nextValue: boolean, isCurrentActive: boolean) {
    setTogglingGroupIds((current) => [...current, groupId]);
    try {
      await appData.toggleGroup(groupId);
      await appData.refreshGroups();
      await appData.refreshBots();
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal mengubah status group.", "danger");
    } finally {
      setTogglingGroupIds((current) => current.filter((item) => item !== groupId));
    }
  }

  async function handleDelete(groupId: string) {
    const confirmed = window.confirm("Yakin ingin keluar dari grup ini?");
    if (!confirmed) {
      return;
    }

    try {
      const message = await appData.deleteGroup(groupId);
      await appData.refreshGroups();
      await appData.refreshBots();
      showToast(message, "success");
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal menghapus group.", "danger");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isOwner ? "List Group" : "Kelola Group"}
        actions={
          <button
            className="inline-flex w-auto items-center justify-center gap-2 rounded-[16px] bg-linear-to-r from-primary to-accent px-4 py-2.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            type="button"
            onClick={() => setShowJoinModal(true)}
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
      ) : appData.groups.length === 0 ? (
        <SurfaceCard>
          <div className="px-5 py-6 text-sm text-text-secondary">
            {isOwner
              ? "Belum ada group. Hubungkan bot owner lalu join group baru terlebih dahulu."
              : "Belum ada group. Tambahkan group baru terlebih dahulu."}
          </div>
        </SurfaceCard>
      ) : (
        <div
          ref={listContainerRef}
          className="overflow-y-auto overscroll-y-contain pr-1"
          style={listMaxHeight ? { maxHeight: `${listMaxHeight}px` } : undefined}
        >
          <div className="grid gap-4">
            {appData.groups.map((group) => (
              <GroupCard
                key={group.id}
                name={group.name}
                isActive={group.isActive}
                isBusy={togglingGroupIds.includes(group.id)}
                onDelete={() => handleDelete(group.id)}
                onToggle={(nextValue) => handleToggle(group.id, nextValue, group.isActive)}
              />
            ))}
          </div>
        </div>
      )}

      <Modal open={showJoinModal} title={isOwner ? "Join Group Owner" : "Join Group Baru"} onClose={() => setShowJoinModal(false)}>
        <form className="space-y-4" onSubmit={handleJoinGroup}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">INVITE LINK</span>
            <input
              value={inviteLink}
              onChange={(event) => setInviteLink(event.target.value)}
              placeholder="https://chat.whatsapp.com/..."
            />
          </label>

          <button
            className="flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold tracking-[0.08em] text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isJoining}
          >
            {isJoining ? "MEMPROSES..." : "JOIN GROUP"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
