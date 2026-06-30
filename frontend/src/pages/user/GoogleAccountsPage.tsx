import { ChevronDown, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GoogleAccountCategoryModel, GoogleAccountModel, TransactionModel } from "../../types/models";

function normalizeGoogleAccountEmail(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const [emailPart, ...metadataParts] = raw.split("|");
  const accountName = emailPart.trim().toLowerCase().replace(/@gmail\.com$/i, "");
  if (!/^[^\s@,;]+$/i.test(accountName)) {
    throw new Error(`Akun Google tidak perlu @gmail.com: ${accountName || raw}`);
  }
  const metadata = metadataParts.join("|").trim();
  return metadata ? `${accountName} | ${metadata}` : accountName;
}

function stripGmailSuffix(value: string) {
  return String(value ?? "").replace(/@gmail\.com\b/gi, "");
}

type SelectedMember = {
  key: string;
  transactionId: number;
  buyerEmail: string;
  idTrx: string;
};

type AccountSlotFilter = "all" | "available" | "full" | "suspended";
type AccountSlotSort = "default" | "most" | "least" | "subscription-longest" | "subscription-shortest";

function splitBuyerEmails(item: TransactionModel) {
  const fallback = item.buyerEmail || item.customerJid;
  return (fallback || "")
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getTotalSlots(item: GoogleAccountModel) {
  return /\|\s*full\s+private\b/i.test(item.email) ? 1 : item.totalSlots;
}

function getUsedSlots(item: GoogleAccountModel) {
  return Math.min(Math.max(item.usedSlots, 0), getTotalSlots(item));
}

function getAvailableSlots(item: GoogleAccountModel) {
  return Math.max(getTotalSlots(item) - getUsedSlots(item), 0);
}

function isFullAccount(item: GoogleAccountModel) {
  return getAvailableSlots(item) <= 0;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function getSubscriptionSortTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 10);
}

function isActiveMemberTransaction(transaction: TransactionModel) {
  if (transaction.memberStatus !== "anggota") return false;
  if (transaction.status !== "paid") return false;
  return true;
}

function sortGoogleAccounts(items: GoogleAccountModel[]) {
  return [...items].sort((a, b) => {
    if (a.isSuspended !== b.isSuspended) return a.isSuspended ? 1 : -1;
    const aFull = isFullAccount(a);
    const bFull = isFullAccount(b);
    if (aFull !== bFull) return aFull ? 1 : -1;
    if (!aFull && !bFull) {
      const availableDiff = getAvailableSlots(a) - getAvailableSlots(b);
      if (availableDiff !== 0) return availableDiff;
    }
    return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
  });
}

export function GoogleAccountsPage({ embedded = false }: { embedded?: boolean }) {
  const appData = useAppData();
  const { showToast } = useToast();
  const [items, setItems] = useState<GoogleAccountModel[]>([]);
  const [categories, setCategories] = useState<GoogleAccountCategoryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GoogleAccountCategoryModel | null>(null);
  const [editingAccount, setEditingAccount] = useState<GoogleAccountModel | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccountModel | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<SelectedMember[]>([]);
  const [checkingAccountId, setCheckingAccountId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState({ category: "", email: "", subscriptionExpiresAt: "" });
  const [emailText, setEmailText] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryName, setCategoryName] = useState("");
  const [slotFilter, setSlotFilter] = useState<AccountSlotFilter>("all");
  const [slotSort, setSlotSort] = useState<AccountSlotSort>("default");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [data, nextCategories] = await Promise.all([
        appData.fetchGoogleAccounts(),
        appData.fetchGoogleAccountCategories(),
      ]);
      setItems(sortGoogleAccounts(data));
      setCategories(nextCategories);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat Google Account", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appData.trxGeminiVersion]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let emails: string[];
    try {
      emails = [
        ...new Set(
          emailText
            .split(/[\n,;]+/)
            .map((value) => normalizeGoogleAccountEmail(value))
            .filter(Boolean),
        ),
      ];
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Akun Google tidak perlu @gmail.com.", "danger");
      return;
    }
    if (emails.length === 0) {
      showToast("Email akun Google wajib diisi.", "danger");
      return;
    }

    setSaving(true);
    try {
      const created: GoogleAccountModel[] = [];
      for (const email of emails) {
        const item = await appData.createGoogleAccount({
          email,
          category: accountForm.category,
          subscriptionExpiresAt: accountForm.subscriptionExpiresAt || null,
        });
        created.push(item);
      }
      setItems((current) => sortGoogleAccounts([...created, ...current]));
      setEmailText("");
      setAccountForm({ category: "", email: "", subscriptionExpiresAt: "" });
      setIsModalOpen(false);
      showToast(`${created.length} Google Account berhasil disimpan.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan Google Account", "danger");
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(item: GoogleAccountModel) {
    setEditingAccount(item);
    setAccountForm({
      category: item.category ?? "",
      email: item.email,
      subscriptionExpiresAt: toDateInputValue(item.subscriptionExpiresAt),
    });
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccount) return;

    let email = "";
    try {
      email = normalizeGoogleAccountEmail(accountForm.email);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Akun Google tidak perlu @gmail.com.", "danger");
      return;
    }

    if (!email) {
      showToast("Email akun Google wajib diisi.", "danger");
      return;
    }

    setSaving(true);
    try {
      await appData.updateGoogleAccount(editingAccount.id, {
        category: accountForm.category,
        email,
        subscriptionExpiresAt: accountForm.subscriptionExpiresAt || null,
      });
      const nextItems = await appData.fetchGoogleAccounts();
      setItems(sortGoogleAccounts(nextItems));
      setEditingAccount(null);
      showToast("Google Account berhasil diubah.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal mengubah Google Account.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleCategorySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      showToast("Nama kategori wajib diisi.", "danger");
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await appData.updateGoogleAccountCategory(editingCategory.id, { name });
        showToast("Kategori berhasil diubah.", "success");
      } else {
        await appData.createGoogleAccountCategory({ name });
        showToast("Kategori berhasil disimpan.", "success");
      }
      const [nextCategories, nextItems] = await Promise.all([
        appData.fetchGoogleAccountCategories(),
        appData.fetchGoogleAccounts(),
      ]);
      setCategories(nextCategories);
      setItems(sortGoogleAccounts(nextItems));
      setCategoryName("");
      setEditingCategory(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan kategori.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(item: GoogleAccountCategoryModel) {
    if (!window.confirm(`Hapus kategori ${item.name}?`)) return;
    setSaving(true);
    try {
      await appData.deleteGoogleAccountCategory(item.id);
      const [nextCategories, nextItems] = await Promise.all([
        appData.fetchGoogleAccountCategories(),
        appData.fetchGoogleAccounts(),
      ]);
      setCategories(nextCategories);
      setItems(sortGoogleAccounts(nextItems));
      if (categoryFilter === item.name) setCategoryFilter("all");
      if (accountForm.category === item.name) {
        setAccountForm((current) => ({ ...current, category: "" }));
      }
      showToast("Kategori berhasil dihapus.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus kategori.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(item: GoogleAccountModel) {
    if (!window.confirm(`Hapus Google Account ${item.email}?`)) return;
    setSaving(true);
    try {
      await appData.deleteGoogleAccount(item.id);
      setItems((current) => current.filter((account) => account.id !== item.id));
      showToast("Google Account berhasil dihapus.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus Google Account.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function openAccountCheckModal(item: GoogleAccountModel) {
    setCheckingAccountId(item.id);
    try {
      const transactions = await appData.fetchTransactions();
      const accountMembers = transactions.filter((transaction) => {
          const sameAccount =
            transaction.googleAccountId === item.id ||
            transaction.googleAccountEmail?.trim().toLowerCase() === item.email.trim().toLowerCase();
          return sameAccount && isActiveMemberTransaction(transaction);
        }).flatMap((transaction) => {
          const emails = splitBuyerEmails(transaction);
          return emails.map((buyerEmail, index) => ({
            key: `${transaction.id}-${index}`,
            transactionId: transaction.id,
            buyerEmail,
            idTrx: transaction.idTrx,
          }));
        });
      setSelectedTransactions(accountMembers);
      setSelectedAccount(item);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat anggota aktif.", "danger");
    } finally {
      setCheckingAccountId(null);
    }
  }

  async function handleToggleAccountSuspend(item: GoogleAccountModel) {
    const nextSuspended = !item.isSuspended;
    setSaving(true);
    try {
      const updated = await appData.setGoogleAccountSuspended(item.id, nextSuspended);
      const nextItems = await appData.fetchGoogleAccounts();
      setItems(sortGoogleAccounts(nextItems));
      setSelectedAccount(updated);
      showToast(
        nextSuspended ? "Google Account berhasil di-suspend." : "Google Account berhasil di-unsuspend.",
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal mengubah status Google Account.", "danger");
    } finally {
      setSaving(false);
    }
  }

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const nextItems = items.filter((item) => {
      const full = isFullAccount(item);
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (slotFilter === "available" && (item.isSuspended || full)) return false;
      if (slotFilter === "full" && (item.isSuspended || !full)) return false;
      if (slotFilter === "suspended" && !item.isSuspended) return false;
      if ((slotSort === "most" || slotSort === "least") && (item.isSuspended || full)) return false;
      if (!keyword) return true;

      const statusText = item.isSuspended ? "google account suspended suspend" : "google account aktif";
      return `${item.email} ${statusText}`.toLowerCase().includes(keyword);
    });

    if (slotSort === "default") return nextItems;

    return [...nextItems].sort((a, b) => {
      if (slotSort === "subscription-longest" || slotSort === "subscription-shortest") {
        const timeA = getSubscriptionSortTime(a.subscriptionExpiresAt);
        const timeB = getSubscriptionSortTime(b.subscriptionExpiresAt);
        if (timeA === null && timeB === null) return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        const diff = timeA - timeB;
        if (diff !== 0) return slotSort === "subscription-shortest" ? diff : -diff;
        return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
      }

      const diff = getAvailableSlots(a) - getAvailableSlots(b);
      if (diff !== 0) return slotSort === "least" ? diff : -diff;
      return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
    });
  }, [categoryFilter, items, query, slotFilter, slotSort]);

  const filterControls = (
    <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_190px]">
      <label className="relative flex min-h-[48px] w-full min-w-[220px] max-w-[360px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 sm:w-[320px]">
        <Search size={18} className="pointer-events-none absolute left-5 text-text-secondary" />
        <input
          className="h-full w-full rounded-none border-0 bg-transparent py-0 pl-9 pr-3 text-sm text-white outline-none placeholder:text-text-muted focus:border-0"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari akun Google"
        />
      </label>
      <label className="relative flex min-h-[48px] w-full min-w-[160px] max-w-[190px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 sm:w-[180px]">
        <select
          className="h-full w-full appearance-none rounded-none border-0 bg-transparent py-0 pr-7 text-sm font-bold text-white outline-none focus:border-0"
          value={slotFilter}
          onChange={(event) => setSlotFilter(event.target.value as AccountSlotFilter)}
        >
          <option className="bg-[#5b6473] text-white" value="all">Semua</option>
          <option className="bg-[#5b6473] text-white" value="available">Tersedia</option>
          <option className="bg-[#5b6473] text-white" value="full">Penuh</option>
          <option className="bg-[#5b6473] text-white" value="suspended">Suspend</option>
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-4 text-text-secondary" />
      </label>
      <label className="relative flex min-h-[48px] w-full min-w-[160px] max-w-[190px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 sm:w-[180px]">
        <select
          className="h-full w-full appearance-none rounded-none border-0 bg-transparent py-0 pr-7 text-sm font-bold text-white outline-none focus:border-0"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option className="bg-[#5b6473] text-white" value="all">Kategori</option>
          {categories.map((item) => (
            <option key={item.id} className="bg-[#5b6473] text-white" value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-4 text-text-secondary" />
      </label>
      <label className="relative flex min-h-[48px] w-full min-w-[170px] max-w-[210px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 sm:w-[190px]">
        <select
          className="h-full w-full appearance-none rounded-none border-0 bg-transparent py-0 pr-7 text-sm font-bold text-white outline-none focus:border-0"
          value={slotSort}
          onChange={(event) => setSlotSort(event.target.value as AccountSlotSort)}
        >
          <option className="bg-[#5b6473] text-white" value="default">Urut</option>
          <option className="bg-[#5b6473] text-white" value="most">Slot Terbanyak</option>
          <option className="bg-[#5b6473] text-white" value="least">Slot Tersedikit</option>
          <option className="bg-[#5b6473] text-white" value="subscription-longest">Langganan Paling Lama</option>
          <option className="bg-[#5b6473] text-white" value="subscription-shortest">Langganan Paling Sebentar</option>
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-4 text-text-secondary" />
      </label>
    </div>
  );

  const headerActions = (
    <>
      <button
        className="inline-flex min-h-[48px] items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-3 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
        type="button"
        onClick={() => {
          setCategoryName("");
          setEditingCategory(null);
          setIsCategoryModalOpen(true);
        }}
      >
        <Plus size={18} /> Add Kategori
      </button>
      <button
        className="inline-flex min-h-[48px] items-center gap-2 rounded-[18px] bg-linear-to-r from-primary to-accent px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
        type="button"
        onClick={() => {
          setAccountForm({ category: "", email: "", subscriptionExpiresAt: "" });
          setIsModalOpen(true);
        }}
      >
        <Plus size={18} /> Add Google
      </button>
    </>
  );

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
      ) : (
        <PageHeader
          title="Google Accounts"
          subtitle="Daftar akun Google untuk penjualan manual."
          actions={headerActions}
        />
      )}

      {loading ? (
        null
      ) : (
        <SurfaceCard className="p-3 lg:p-4">
          {filterControls}
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-secondary">
              Belum ada Google Account.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-secondary">
              Akun Google tidak ditemukan.
            </div>
          ) : (
            <div className="overflow-x-hidden">
            <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[28%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[25%]" />
              </colgroup>
              <thead className="text-[12px] font-extrabold text-white">
                <tr>
                  <th className="px-3 py-3">Kategori</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Exp Langganan</th>
                  <th className="px-3 py-3">Slot</th>
                  <th className="px-2 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                {filteredItems.map((item) => {
                  const full = isFullAccount(item);
                  return (
                    <tr
                      key={item.id}
                      className={
                        item.isSuspended
                          ? "border-l-2 border-l-[rgba(250,204,21,0.62)] bg-[rgba(113,63,18,0.22)] transition hover:bg-[rgba(113,63,18,0.32)]"
                          : full
                          ? "border-l-2 border-l-[rgba(248,113,113,0.62)] bg-[rgba(127,29,29,0.2)] transition hover:bg-[rgba(127,29,29,0.3)]"
                          : "border-l-2 border-l-[rgba(74,222,128,0.58)] bg-[rgba(20,83,45,0.18)] transition hover:bg-[rgba(20,83,45,0.28)]"
                      }
                    >
                      <td className="px-3 py-2.5 text-text-primary">
                        <span className="block truncate" title={item.category || "-"}>
                          {item.category || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white" title={item.email}>
                            {item.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-text-primary">
                        <span className="block truncate" title={formatDate(item.subscriptionExpiresAt)}>
                          {formatDate(item.subscriptionExpiresAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-white">
                          {getAvailableSlots(item)}/{getTotalSlots(item)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex justify-center gap-2">
                          <button
                            className="rounded-[10px] bg-[rgba(15,23,42,0.95)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[rgba(15,23,42,0.78)] disabled:opacity-60"
                            type="button"
                            disabled={checkingAccountId === item.id}
                            onClick={() => void openAccountCheckModal(item)}
                          >
                            {checkingAccountId === item.id ? "Mengecek..." : "Cek"}
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(56,189,248,0.22)] px-3 py-2 text-xs font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                            type="button"
                            onClick={() => openEditModal(item)}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(244,63,94,0.24)] px-3 py-2 text-xs font-bold text-danger transition hover:bg-[rgba(244,63,94,0.08)] disabled:opacity-60"
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteAccount(item)}
                          >
                            <Trash2 size={13} /> Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </SurfaceCard>
      )}

      <Modal
        open={isCategoryModalOpen}
        title="Add Kategori"
        onClose={() => {
          setIsCategoryModalOpen(false);
          setCategoryName("");
          setEditingCategory(null);
        }}
        wide
      >
        <div className="space-y-5">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={handleCategorySubmit}>
            <label className="block flex-1 space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Nama Kategori</span>
              <input
                className="min-h-[54px]"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Contoh: Google Pro 1"
              />
            </label>
            <div className="flex gap-2">
              {editingCategory ? (
                <button
                  className="min-h-[54px] rounded-[12px] border border-[rgba(56,189,248,0.22)] px-4 text-sm font-bold text-text-secondary transition hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryName("");
                  }}
                >
                  Batal
                </button>
              ) : null}
              <button
                className="min-h-[54px] rounded-[12px] bg-[rgba(15,23,42,0.96)] px-5 text-sm font-bold text-white disabled:opacity-60"
                type="submit"
                disabled={saving}
              >
                {saving ? "Menyimpan..." : editingCategory ? "Update" : "Simpan"}
              </button>
            </div>
          </form>

          <div className="overflow-hidden rounded-[16px] border border-[rgba(56,189,248,0.14)]">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[70px]" />
                <col />
                <col className="w-[180px]" />
              </colgroup>
              <thead className="bg-[rgba(15,23,42,0.72)] text-[12px] font-extrabold text-white">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Nama Kategori</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-text-secondary">
                      Belum ada kategori.
                    </td>
                  </tr>
                ) : (
                  categories.map((item, index) => (
                    <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                      <td className="px-4 py-3 text-text-secondary">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold text-white">
                        <span className="block truncate" title={item.name}>{item.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <button
                            className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(56,189,248,0.22)] px-3 py-2 text-xs font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                            type="button"
                            onClick={() => {
                              setEditingCategory(item);
                              setCategoryName(item.name);
                            }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(244,63,94,0.24)] px-3 py-2 text-xs font-bold text-danger transition hover:bg-[rgba(244,63,94,0.08)] disabled:opacity-60"
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteCategory(item)}
                          >
                            <Trash2 size={13} /> Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal
        open={isModalOpen}
        title="Add Google Account"
        onClose={() => {
          setIsModalOpen(false);
          setAccountForm({ category: "", email: "", subscriptionExpiresAt: "" });
        }}
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Kategori</span>
              <select
                value={accountForm.category}
                onChange={(event) => setAccountForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="">Pilih kategori</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Exp Langganan</span>
              <input
                type="date"
                value={accountForm.subscriptionExpiresAt}
                onChange={(event) => setAccountForm((current) => ({ ...current, subscriptionExpiresAt: event.target.value }))}
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Email Akun Google</span>
            <textarea
              className="min-h-[150px]"
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              placeholder={"contoh: wisnusuro09\nmegayuro01\nmegayuro02"}
            />
            <span className="block text-xs text-text-muted">
              Bisa isi banyak akun tanpa @gmail.com, pisahkan dengan baris baru, koma, atau titik koma.
            </span>
          </label>

          <button
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-[rgba(15,23,42,0.96)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan Google Account"}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingAccount)}
        title="Edit Google Account"
        onClose={() => setEditingAccount(null)}
      >
        <form className="space-y-5" onSubmit={handleEditSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Kategori</span>
            <select
              value={accountForm.category}
              onChange={(event) => setAccountForm((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="">Pilih kategori</option>
              {categories.map((item) => (
                <option key={item.id} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Email</span>
            <input
              value={accountForm.email}
              onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="namaemail"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Exp Langganan</span>
            <input
              type="date"
              value={accountForm.subscriptionExpiresAt}
              onChange={(event) => setAccountForm((current) => ({ ...current, subscriptionExpiresAt: event.target.value }))}
            />
          </label>

          <button
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-[rgba(15,23,42,0.96)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(selectedAccount)}
        title=""
        onClose={() => {
          setSelectedAccount(null);
          setSelectedTransactions([]);
        }}
        wide
      >
        {selectedAccount ? (
          <div className="space-y-6">
            <h3 className="text-lg font-extrabold text-white">Detail Account Google</h3>
            <div
              className={
                selectedAccount.isSuspended
                  ? "rounded-[20px] border border-[rgba(250,204,21,0.34)] bg-[rgba(113,63,18,0.26)] p-5"
                  : !isFullAccount(selectedAccount)
                  ? "rounded-[20px] border border-[rgba(74,222,128,0.3)] bg-[rgba(20,83,45,0.24)] p-5"
                  : "rounded-[20px] border border-[rgba(248,113,113,0.34)] bg-[rgba(127,29,29,0.22)] p-5"
              }
            >
                <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-white">{selectedAccount.email}</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      {selectedAccount.isSuspended ? "Google Account Suspended" : "Google Account"}
                    </p>
                </div>
                <div className="shrink-0 text-3xl font-extrabold text-white">
                  {getAvailableSlots(selectedAccount)}/{getTotalSlots(selectedAccount)}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white">List Anggota</h3>
              {selectedTransactions.length === 0 ? (
                <div className="mt-4 rounded-[16px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.5)] px-4 py-5 text-sm text-text-secondary">
                  Belum ada anggota untuk akun ini.
                </div>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {selectedTransactions.map((transaction, index) => (
                    <div
                      key={transaction.key}
                      className="rounded-[16px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.5)] p-4"
                    >
                      <h4 className="break-words text-sm font-extrabold text-white">
                        {index + 1}. {stripGmailSuffix(transaction.buyerEmail)}
                      </h4>
                      <p className="mt-4 text-sm text-text-secondary">
                        No Pesanan: <span>{transaction.idTrx}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className={
                selectedAccount.isSuspended
                  ? "w-full rounded-[14px] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.12)] px-4 py-3 text-sm font-bold text-success transition hover:bg-[rgba(34,197,94,0.18)] disabled:opacity-60"
                  : "w-full rounded-[14px] border border-[rgba(250,204,21,0.34)] bg-[rgba(113,63,18,0.24)] px-4 py-3 text-sm font-bold text-warning transition hover:bg-[rgba(113,63,18,0.34)] disabled:opacity-60"
              }
              type="button"
              disabled={saving}
              onClick={() => void handleToggleAccountSuspend(selectedAccount)}
            >
              {selectedAccount.isSuspended ? "Unsuspend Akun" : "Suspend Akun"}
            </button>
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
