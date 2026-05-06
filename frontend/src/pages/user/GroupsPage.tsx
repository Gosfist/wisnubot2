import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, UserX } from "lucide-react";
import { GroupCard } from "../../components/GroupCard";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { apiFetch } from "../../lib/http";
import type { GroupPushMemberModel } from "../../types/models";

export function GroupsPage() {
  const appData = useAppData();
  const auth = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(!appData.groups.length || !appData.user);
  const [error, setError] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [selectedJoinBotId, setSelectedJoinBotId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [togglingGroupIds, setTogglingGroupIds] = useState<string[]>([]);
  const [settingsGroup, setSettingsGroup] = useState<{ id: string; name: string } | null>(null);
  const [members, setMembers] = useState<GroupPushMemberModel[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [updatingMemberKey, setUpdatingMemberKey] = useState<string | null>(null);
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
        appData.bots.length ? Promise.resolve(appData.bots) : appData.refreshBots(),
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
      await appData.joinGroup(inviteLink, Number(selectedJoinBotId) || undefined);
      await appData.refreshGroups();
      await appData.refreshBots();
      setInviteLink("");
      setSelectedJoinBotId("");
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

  async function openSettings(group: { id: string; name: string }) {
    setSettingsGroup(group);
    setMemberSearch("");
    await loadPushMembers(group.id);
  }

  async function loadPushMembers(groupId = settingsGroup?.id) {
    if (!groupId) return;
    setIsLoadingMembers(true);
    try {
      const items = await appData.fetchGroupPushMembers(groupId);
      setMembers(items);
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal memuat anggota group.", "danger");
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function handleToggleMemberExclusion(member: GroupPushMemberModel) {
    if (!settingsGroup) return;
    if (member.isAdmin || member.isBot || !member.phoneNumber) {
      if (!member.phoneNumber && !member.isAdmin && !member.isBot) {
        showToast("Nomor WA anggota ini tidak tersedia dari WhatsApp.", "danger");
      }
      return;
    }
    setUpdatingMemberKey(member.jid);
    try {
      if (member.isExcluded && member.exclusionId) {
        await appData.deleteGroupPushExclusion(settingsGroup.id, member.exclusionId);
      } else {
        await appData.addGroupPushExclusion(settingsGroup.id, {
          phoneNumber: member.phoneNumber,
          label: member.displayName !== member.phoneNumber ? member.displayName : undefined,
        });
      }
      await loadPushMembers(settingsGroup.id);
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : "Gagal mengubah pengecualian.", "danger");
    } finally {
      setUpdatingMemberKey(null);
    }
  }

  const filteredMembers = members.filter((member) => {
    const keyword = memberSearch.trim().toLowerCase();
    if (!keyword) return true;
    return (
      member.phoneNumber.toLowerCase().includes(keyword) ||
      member.displayName.toLowerCase().includes(keyword) ||
      member.jid.toLowerCase().includes(keyword)
    );
  });

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
                onSettings={() => openSettings({ id: group.id, name: group.name })}
              />
            ))}
          </div>
        </div>
      )}

      <Modal open={showJoinModal} title={isOwner ? "Join Group Owner" : "Join Group Baru"} onClose={() => setShowJoinModal(false)}>
        <form className="space-y-4" onSubmit={handleJoinGroup}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.22em] text-text-muted">BOT</span>
            <select value={selectedJoinBotId} onChange={(event) => setSelectedJoinBotId(event.target.value)}>
              <option value="">Pilih bot online</option>
              {appData.bots.filter((bot) => bot.status === "online").map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.purpose === "push_contact" ? "Bot 2 Push Kontak" : "Bot 1 Utama"} - {bot.phoneNumber}
                </option>
              ))}
            </select>
          </label>

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

      <Modal
        open={Boolean(settingsGroup)}
        title={`Pengecualian Push - ${settingsGroup?.name ?? ""}`}
        onClose={() => {
          setSettingsGroup(null);
          setMembers([]);
        }}
        wide
        bodyClassName="overflow-hidden"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-text-secondary">
              Data anggota diambil langsung dari WhatsApp group saat modal dibuka. Admin otomatis dilewati.
            </p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.2)] px-4 py-2.5 text-sm font-bold text-accent hover:bg-[rgba(56,189,248,0.08)] disabled:opacity-60"
              type="button"
              onClick={() => void loadPushMembers()}
              disabled={isLoadingMembers}
            >
              <RefreshCw size={15} className={isLoadingMembers ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="grid gap-3 text-xs text-text-secondary sm:grid-cols-3">
            <div className="rounded-[14px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.45)] px-4 py-3">
              Total: <strong className="text-white">{members.length}</strong>
            </div>
            <div className="rounded-[14px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.45)] px-4 py-3">
              Admin: <strong className="text-white">{members.filter((member) => member.isAdmin).length}</strong>
            </div>
            <div className="rounded-[14px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.45)] px-4 py-3">
              Dikecualikan: <strong className="text-white">{members.filter((member) => member.isExcluded).length}</strong>
            </div>
          </div>

          <input
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
            placeholder="Cari nomor atau nama"
          />

          <div className="clean-scrollbar max-h-[48vh] space-y-2 overflow-y-auto pr-2">
            {isLoadingMembers ? (
              <div className="flex min-h-32 items-center justify-center">
                <div className="size-9 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
              </div>
            ) : members.length === 0 ? (
              <div className="rounded-[14px] border border-[rgba(56,189,248,0.12)] px-4 py-3 text-sm text-text-secondary">
                Anggota group tidak tersedia. Pastikan bot masih berada di group dan online.
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="rounded-[14px] border border-[rgba(56,189,248,0.12)] px-4 py-3 text-sm text-text-secondary">
                Tidak ada anggota yang cocok.
              </div>
            ) : (
              filteredMembers.map((member) => (
                <div
                  key={member.jid}
                  className="flex flex-col gap-3 rounded-[14px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.5)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-white">{member.phoneNumber || "Nomor tidak tersedia"}</span>
                      {member.isAdmin ? (
                        <span className="rounded-full bg-[rgba(37,99,235,0.16)] px-2.5 py-1 text-xs font-bold text-accent">
                          ADMIN
                        </span>
                      ) : null}
                      {member.isBot ? (
                        <span className="rounded-full bg-[rgba(148,163,184,0.12)] px-2.5 py-1 text-xs font-bold text-text-secondary">
                          BOT
                        </span>
                      ) : null}
                      {member.isExcluded ? (
                        <span className="rounded-full bg-[rgba(244,63,94,0.12)] px-2.5 py-1 text-xs font-bold text-danger">
                          TIDAK DIPUSH
                        </span>
                      ) : null}
                    </div>
                    {member.displayName && member.displayName !== member.phoneNumber ? (
                      <div className="mt-1 truncate text-xs text-text-secondary">{member.displayName}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={
                      member.isExcluded
                        ? "inline-flex items-center justify-center gap-2 rounded-[14px] border border-[rgba(34,197,94,0.18)] px-4 py-2.5 text-sm font-bold text-success hover:bg-[rgba(34,197,94,0.08)] disabled:opacity-60"
                        : "inline-flex items-center justify-center gap-2 rounded-[14px] border border-[rgba(244,63,94,0.18)] px-4 py-2.5 text-sm font-bold text-danger hover:bg-[rgba(244,63,94,0.08)] disabled:opacity-60"
                    }
                    onClick={() => void handleToggleMemberExclusion(member)}
                    disabled={member.isAdmin || member.isBot || !member.phoneNumber || updatingMemberKey === member.jid}
                  >
                    {member.isExcluded ? <CheckCircle2 size={16} /> : <UserX size={16} />}
                    {member.isAdmin || member.isBot
                      ? "Otomatis Lewat"
                      : !member.phoneNumber
                        ? "Nomor Tidak Ada"
                        : member.isExcluded
                          ? "Izinkan Push"
                          : "Jangan Push"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
