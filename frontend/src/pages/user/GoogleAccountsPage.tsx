import { Download, Plus, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GoogleAccountModel, TransactionModel } from "../../types/models";

function getInitials(email: string) {
  const name = email.split("@")[0] || email;
  return name.slice(0, 2).toUpperCase();
}

function getTransactionActiveStatus(item: TransactionModel) {
  if (item.activeStatus === "aktif") return "aktif";
  if (item.activeStatus === "expired") return "expired";
  if (!item.activeExpiresAt) return "aktif";
  const parsed = new Date(item.activeExpiresAt);
  if (Number.isNaN(parsed.getTime())) return "aktif";
  return parsed.getTime() >= Date.now() ? "aktif" : "expired";
}

function isUsedSlotTransaction(item: TransactionModel) {
  return !(item.memberStatus === "kick" && getTransactionActiveStatus(item) === "expired");
}

function getRemainingSlots(item: GoogleAccountModel) {
  return Math.max(item.totalSlots - item.usedSlots, 0);
}

export function GoogleAccountsPage({ embedded = false }: { embedded?: boolean }) {
  const appData = useAppData();
  const { showToast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<GoogleAccountModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccountModel | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<TransactionModel[]>([]);
  const [checkingAccountId, setCheckingAccountId] = useState<number | null>(null);
  const [emailText, setEmailText] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await appData.fetchGoogleAccounts();
      setItems(data);
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
    const emails = [
      ...new Set(
        emailText
          .split(/[\n,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (emails.length === 0) {
      showToast("Email akun Google wajib diisi.", "danger");
      return;
    }

    setSaving(true);
    try {
      const created: GoogleAccountModel[] = [];
      for (const email of emails) {
        const item = await appData.createGoogleAccount({ email });
        created.push(item);
      }
      setItems((current) => [...created.reverse(), ...current]);
      setEmailText("");
      setIsModalOpen(false);
      showToast(`${created.length} Google Account berhasil disimpan.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan Google Account", "danger");
    } finally {
      setSaving(false);
    }
  }

  function handleExportExcel() {
    const rows = items.map((item) => ({
      Email: item.email,
      "Sisa Slot": getRemainingSlots(item),
      "Total Slot": item.totalSlots,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Google Accounts");
    XLSX.writeFile(workbook, "google-accounts.xlsx");
  }

  async function handleImportExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const emails = [
        ...new Set(
          rows
            .map((row) => {
              const entries = Object.entries(row);
              const emailEntry = entries.find(([key]) => key.trim().toLowerCase() === "email");
              return String((emailEntry ?? entries[0])?.[1] ?? "").trim();
            })
            .filter(Boolean),
        ),
      ];

      if (emails.length === 0) {
        showToast("File Excel tidak berisi akun Google.", "danger");
        return;
      }

      const created: GoogleAccountModel[] = [];
      for (const email of emails) {
        const item = await appData.createGoogleAccount({ email });
        created.push(item);
      }
      const nextItems = await appData.fetchGoogleAccounts();
      setItems(nextItems);
      showToast(`${created.length} Google Account berhasil diimport.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal import Google Account.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function openAccountCheckModal(item: GoogleAccountModel) {
    setCheckingAccountId(item.id);
    try {
      const transactions = await appData.fetchTransactions();
      const usedSlotMembers = transactions.filter((transaction) => {
          const sameAccount =
            transaction.googleAccountId === item.id ||
            transaction.googleAccountEmail?.trim().toLowerCase() === item.email.trim().toLowerCase();
          return sameAccount && isUsedSlotTransaction(transaction);
        });
      setSelectedTransactions(usedSlotMembers);
      setSelectedAccount(item);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat anggota aktif.", "danger");
    } finally {
      setCheckingAccountId(null);
    }
  }

  async function handleDeleteAccount(item: GoogleAccountModel) {
    const confirmed = window.confirm(`Hapus Google Account ${item.email}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const message = await appData.deleteGoogleAccount(item.id);
      setItems((current) => current.filter((account) => account.id !== item.id));
      showToast(message, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus Google Account.", "danger");
    } finally {
      setSaving(false);
    }
  }

  const headerActions = (
    <>
      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".xlsx,.xls"
        onChange={(event) => void handleImportExcel(event)}
      />
      <button
        className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-3 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
        type="button"
        disabled={saving}
        onClick={() => importInputRef.current?.click()}
      >
        <Upload size={18} /> Import Excel
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-3 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
        type="button"
        onClick={handleExportExcel}
      >
        <Download size={18} /> Export Excel
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-[14px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow"
        type="button"
        onClick={() => setIsModalOpen(true)}
      >
        <Plus size={18} /> Add Google
      </button>
    </>
  );

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap justify-end gap-2">{headerActions}</div>
      ) : (
        <PageHeader
          title="Google Accounts"
          subtitle="Daftar akun Google untuk penjualan manual."
          actions={headerActions}
        />
      )}

      {loading ? (
        null
      ) : items.length === 0 ? (
        <div className="rounded-[20px] border border-glass-border bg-[rgba(30,41,59,0.88)] py-10 text-center text-sm text-text-secondary">
          Belum ada Google Account.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const remaining = getRemainingSlots(item);
            return (
              <article
                key={item.id}
                className="rounded-[18px] border border-[rgba(56,189,248,0.18)] bg-[rgba(30,41,59,0.86)] p-5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[rgba(15,23,42,0.9)] text-sm font-extrabold text-white">
                      {getInitials(item.email)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-extrabold text-white">{item.email}</h2>
                      <p className="mt-1 text-sm text-text-secondary">Google Account</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-2xl font-extrabold text-white">
                    {remaining}/{item.totalSlots}
                  </div>
                </div>

                <div className="mt-5 grid gap-2">
                  <button
                    className="w-full rounded-[14px] bg-[rgba(15,23,42,0.95)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[rgba(15,23,42,0.78)]"
                    type="button"
                    disabled={checkingAccountId === item.id}
                    onClick={() => void openAccountCheckModal(item)}
                  >
                    {checkingAccountId === item.id ? "Mengecek..." : "Cek"}
                  </button>
                  <button
                    className="w-full rounded-[14px] border border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm font-bold text-danger transition hover:bg-[rgba(239,68,68,0.16)] disabled:opacity-60"
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDeleteAccount(item)}
                  >
                    Hapus
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={isModalOpen}
        title="Add Google Account"
        onClose={() => setIsModalOpen(false)}
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Email Akun Google</span>
            <textarea
              className="min-h-[150px]"
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              placeholder={"contoh: wisnusuro09\nmegayuro01\nmegayuro02"}
            />
            <span className="block text-xs text-text-muted">
              Bisa isi banyak akun, pisahkan dengan baris baru, koma, atau titik koma.
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
            <div className="rounded-[20px] border border-[rgba(239,68,68,0.38)] bg-[rgba(239,68,68,0.08)] p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[rgba(15,23,42,0.96)] text-base font-extrabold text-white">
                    {getInitials(selectedAccount.email)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-white">{selectedAccount.email}</h3>
                    <p className="mt-1 text-sm text-text-secondary">Google Account</p>
                  </div>
                </div>
                <div className="shrink-0 text-3xl font-extrabold text-white">
                  {getRemainingSlots(selectedAccount)}/{selectedAccount.totalSlots}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white">List Anggota</h3>
              {selectedTransactions.length === 0 ? (
                <div className="mt-4 rounded-[16px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.5)] px-4 py-5 text-sm text-text-secondary">
                  Belum ada anggota aktif untuk akun ini.
                </div>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {selectedTransactions.map((transaction, index) => (
                    <div
                      key={transaction.id}
                      className="rounded-[16px] border border-[rgba(56,189,248,0.14)] bg-[rgba(15,23,42,0.5)] p-4"
                    >
                      <h4 className="break-words text-sm font-extrabold text-white">
                        {index + 1}. {transaction.buyerEmail || transaction.customerJid}
                      </h4>
                      <p className="mt-4 text-sm text-text-secondary">
                        No Pesanan: <span>{transaction.idTrx}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
