import { CheckCircle2, Download, Edit2, Plus, ReceiptText, Search, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { formatCurrency } from "../../lib/format";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GoogleAccountModel, TransactionModel } from "../../types/models";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatCustomerJid(value: string) {
  return value.replace("@s.whatsapp.net", "");
}

function formatProductName(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.replace(/^\/+/, "").trim();
  if (!normalized) return "-";
  if (normalized.includes("@")) return normalized;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toTodayInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDateInput(value: unknown) {
  if (value instanceof Date) {
    const offsetMs = value.getTimezoneOffset() * 60 * 1000;
    return new Date(value.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const raw = String(value ?? "").trim();
  if (!raw) return toTodayInputValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getCell(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([entryKey]) => entryKey.trim().toLowerCase() === key.toLowerCase());
    if (found) return found[1];
  }
  return "";
}

function normalizeDuration(value: unknown) {
  return 30;
}

export function TransactionsPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TransactionModel | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [manualForm, setManualForm] = useState({
    googleAccountId: "",
    platform: "shopee",
    noPesanan: "",
    buyerEmail: "",
    activeDurationDays: "30",
    startDate: toTodayInputValue(),
  });
  const [editForm, setEditForm] = useState({
    idTrx: "",
    noBuyer: "",
    platform: "",
    amount: "",
    activeStartAt: "",
    activeExpiresAt: "",
    warrantyExpiresAt: "",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [transactions, accounts] = await Promise.all([
          appData.fetchTransactions(),
          appData.fetchGoogleAccounts(),
        ]);
        if (mounted) {
          setItems(transactions);
          setGoogleAccounts(accounts);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Gagal memuat transaksi", "danger");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  );
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.idTrx.toLowerCase().includes(q));
  }, [items, query]);

  function openEditModal(item: TransactionModel) {
    setEditingItem(item);
    setEditForm({
      idTrx: item.idTrx,
      noBuyer: formatCustomerJid(item.customerJid),
      platform: item.platform || "whatsapp",
      amount: String(item.amount),
      activeStartAt: toDateInputValue(item.activeStartAt),
      activeExpiresAt: toDateInputValue(item.activeExpiresAt),
      warrantyExpiresAt: toDateInputValue(item.warrantyExpiresAt),
    });
  }

  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualForm.googleAccountId) {
      showToast("Akun Google wajib dipilih.", "danger");
      return;
    }

    setIsSaving(true);
    try {
      await appData.createManualTransaction({
        googleAccountId: Number(manualForm.googleAccountId),
        platform: manualForm.platform,
        noPesanan: manualForm.noPesanan,
        buyerEmail: manualForm.buyerEmail,
        activeDurationDays: Number(manualForm.activeDurationDays),
        startDate: manualForm.startDate,
      });
      const [nextItems, nextAccounts] = await Promise.all([
        appData.fetchTransactions(),
        appData.fetchGoogleAccounts(),
      ]);
      setItems(nextItems);
      setGoogleAccounts(nextAccounts);
      setManualForm({
        googleAccountId: "",
        platform: "shopee",
        noPesanan: "",
        buyerEmail: "",
        activeDurationDays: "30",
        startDate: toTodayInputValue(),
      });
      setIsManualOpen(false);
      showToast("Transaksi manual berhasil disimpan.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan transaksi manual.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  function handleExportExcel() {
    const rows = filteredItems.map((item) => ({
      idTrx: item.idTrx,
      Produk: formatProductName(item.commandName),
      Platform: item.platform || "whatsapp",
      "Akun Google": item.googleAccountEmail ?? "",
      "Email Buyer": item.buyerEmail ?? formatCustomerJid(item.customerJid),
      Bayar: formatDateTime(item.paidAt ?? item.createdAt),
      Start: formatShortDate(item.activeStartAt),
      Exp: formatShortDate(item.activeExpiresAt),
      Status: "Sukses",
      Total: item.amount,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    XLSX.writeFile(workbook, `transaksi-${toTodayInputValue()}.xlsx`);
  }

  async function handleImportExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (rows.length === 0) {
        showToast("File Excel kosong.", "danger");
        return;
      }

      const accountByEmail = new Map(
        googleAccounts.map((account) => [account.email.trim().toLowerCase(), account]),
      );
      const existingOrders = new Set(items.map((item) => item.idTrx.trim().toLowerCase()));
      const seenOrders = new Set<string>();
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const accountEmail = String(getCell(row, ["Akun Google", "Google Account", "akun_google"])).trim();
        const account = accountByEmail.get(accountEmail.toLowerCase());
        if (!account) {
          throw new Error(`Akun Google tidak ditemukan: ${accountEmail}`);
        }

        const noPesanan = String(getCell(row, ["No Pesanan", "idTrx", "IDTRX", "No Order"])).trim();
        const orderKey = noPesanan.toLowerCase();
        if (!noPesanan || seenOrders.has(orderKey) || existingOrders.has(orderKey)) {
          skipped += 1;
          continue;
        }
        seenOrders.add(orderKey);

        const buyerEmail = String(getCell(row, ["Email", "Email Buyer", "Buyer Email"])).trim();
        const platformRaw = String(getCell(row, ["Platform"])).trim().toLowerCase();
        const platform = platformRaw === "whatsapp" ? "whatsapp" : "shopee";
        const activeDurationDays = normalizeDuration(getCell(row, ["Masa Aktif", "Durasi", "Active Days"]));
        const startDate = formatDateInput(getCell(row, ["Start", "Tanggal Start", "Start Date"]));

        try {
          await appData.createManualTransaction({
            googleAccountId: account.id,
            platform,
            noPesanan,
            buyerEmail,
            activeDurationDays,
            startDate,
          });
          existingOrders.add(orderKey);
          imported += 1;
        } catch (err) {
          if (err instanceof Error && err.message.toLowerCase().includes("no pesanan sudah ada")) {
            skipped += 1;
            continue;
          }
          throw err;
        }
      }

      const [nextItems, nextAccounts] = await Promise.all([
        appData.fetchTransactions(),
        appData.fetchGoogleAccounts(),
      ]);
      setItems(nextItems);
      setGoogleAccounts(nextAccounts);
      showToast(
        `${imported} transaksi berhasil diimport${skipped ? `, ${skipped} duplikat dilewati` : ""}.`,
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal import Excel.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);
    try {
      await appData.updateTransaction(editingItem.id, {
        idTrx: editForm.idTrx,
        noBuyer: editForm.noBuyer,
        platform: editForm.platform,
        amount: Number(editForm.amount),
        activeStartAt: editForm.activeStartAt,
        activeExpiresAt: editForm.activeExpiresAt,
        warrantyExpiresAt: editForm.warrantyExpiresAt,
      });
      const nextItems = await appData.fetchTransactions();
      setItems(nextItems);
      setEditingItem(null);
      showToast("Transaksi berhasil diperbarui.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui transaksi.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: TransactionModel) {
    const confirmed = window.confirm(`Hapus transaksi ${item.idTrx}?`);
    if (!confirmed) return;
    try {
      const message = await appData.deleteTransaction(item.id);
      setItems((current) => current.filter((tx) => tx.id !== item.id));
      showToast(message, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus transaksi.", "danger");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transaksi"
        actions={
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
              disabled={isSaving}
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
              onClick={() => setIsManualOpen(true)}
            >
              <Plus size={18} /> Tambah Transaksi
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceCard className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">Sukses</p>
            <strong className="mt-2 block text-2xl font-extrabold text-white">{items.length}</strong>
          </div>
          <div className="rounded-[16px] bg-[rgba(34,197,94,0.12)] p-3 text-success">
            <CheckCircle2 size={22} />
          </div>
        </SurfaceCard>

        <SurfaceCard className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">Total</p>
            <strong className="mt-2 block text-2xl font-extrabold text-white">
              Rp {formatCurrency(totalAmount)}
            </strong>
          </div>
          <div className="rounded-[16px] bg-[rgba(56,189,248,0.12)] p-3 text-accent">
            <ReceiptText size={22} />
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard>
        <label className="relative mb-4 flex min-h-[64px] w-full items-center rounded-[18px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-5">
          <Search size={20} className="pointer-events-none absolute left-6 text-text-secondary" />
          <input
            className="h-full w-full rounded-none border-0 bg-transparent py-0 pl-11 pr-3 text-sm text-white outline-none placeholder:text-text-muted focus:border-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari idTrx"
          />
        </label>
        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-secondary">Belum ada transaksi sukses.</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-secondary">idTrx tidak ditemukan.</div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-[rgba(56,189,248,0.16)]">
            <table className="w-full table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="bg-[rgba(15,23,42,0.76)] text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                <tr>
                  <th className="px-3 py-4">idTrx</th>
                  <th className="px-3 py-4">Produk</th>
                  <th className="px-3 py-4">Platform</th>
                  <th className="px-3 py-4">Start</th>
                  <th className="px-3 py-4">Exp</th>
                  <th className="px-3 py-4">Status</th>
                  <th className="px-3 py-4 text-right">Total</th>
                  <th className="px-3 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.42)]">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                    <td className="break-all px-3 py-4 font-bold leading-snug text-white">
                      {item.idTrx}
                    </td>
                    <td className="break-words px-3 py-4 text-text-primary">
                      {formatProductName(item.commandName)}
                    </td>
                    <td className="break-words px-3 py-4 text-text-secondary">
                      {item.platform || "whatsapp"}{item.isManual ? " - manual" : ""}
                    </td>
                    <td className="break-words px-3 py-4 text-text-secondary">
                      {formatShortDate(item.activeStartAt)}
                    </td>
                    <td className="break-words px-3 py-4 text-text-secondary">
                      {formatShortDate(item.activeExpiresAt)}
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex max-w-full rounded-full border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.12)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-success">
                        Sukses
                      </span>
                    </td>
                    <td className="break-words px-3 py-4 text-right font-extrabold text-white">
                      Rp {formatCurrency(item.amount)}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(56,189,248,0.22)] text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                          type="button"
                          onClick={() => openEditModal(item)}
                          aria-label="Edit transaksi"
                          title="Edit transaksi"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(244,63,94,0.24)] text-danger transition hover:bg-[rgba(244,63,94,0.08)]"
                          type="button"
                          onClick={() => void handleDelete(item)}
                          aria-label="Hapus transaksi"
                          title="Hapus transaksi"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      <Modal
        open={isManualOpen}
        title="Tambah Transaksi"
        onClose={() => setIsManualOpen(false)}
        wide
      >
        <form className="space-y-5" onSubmit={handleManualSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Akun Google</span>
              <select
                value={manualForm.googleAccountId}
                onChange={(event) => setManualForm((current) => ({ ...current, googleAccountId: event.target.value }))}
              >
                <option value="">Pilih akun Google</option>
                {googleAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Platform</span>
              <select
                value={manualForm.platform}
                onChange={(event) => setManualForm((current) => ({ ...current, platform: event.target.value }))}
              >
                <option value="shopee">Shopee</option>
                <option value="whatsapp">Whatsapp</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">No Pesanan</span>
              <input
                value={manualForm.noPesanan}
                onChange={(event) => setManualForm((current) => ({ ...current, noPesanan: event.target.value }))}
                placeholder="2604xxxx"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Email</span>
              <input
                value={manualForm.buyerEmail}
                onChange={(event) => setManualForm((current) => ({ ...current, buyerEmail: event.target.value }))}
                placeholder="email buyer"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Masa Aktif</span>
              <select
                value={manualForm.activeDurationDays}
                onChange={(event) => setManualForm((current) => ({ ...current, activeDurationDays: event.target.value }))}
              >
                <option value="30">1 Bulan</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Start</span>
              <input
                type="date"
                value={manualForm.startDate}
                onChange={(event) => setManualForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
          </div>

          <div className="rounded-[14px] bg-[rgba(148,163,184,0.1)] px-4 py-3 text-sm leading-6 text-text-secondary">
            Perhitungan termasuk hari start sebagai hari pertama.
            <br />
            Jika 30 hari, exp jatuh pada hari ke-30 dan garansi hari ke-15.
          </div>

          <button
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-[rgba(15,23,42,0.96)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Menyimpan..." : "Simpan Transaksi"}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingItem)}
        title="Edit Transaksi"
        onClose={() => setEditingItem(null)}
      >
        <form className="space-y-4" onSubmit={handleSaveEdit}>
          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.18em] text-text-muted">IDTRX</span>
            <input
              value={editForm.idTrx}
              onChange={(event) => setEditForm((current) => ({ ...current, idTrx: event.target.value }))}
              placeholder="CS103-..."
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-bold tracking-[0.18em] text-text-muted">NO BUYER</span>
            <input
              value={editForm.noBuyer}
              onChange={(event) => setEditForm((current) => ({ ...current, noBuyer: event.target.value }))}
              placeholder="628xxxxxxxxxx"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">PLATFORM</span>
              <input
                value={editForm.platform}
                onChange={(event) => setEditForm((current) => ({ ...current, platform: event.target.value }))}
                placeholder="whatsapp"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">TOTAL</span>
              <input
                type="number"
                min="0"
                value={editForm.amount}
                onChange={(event) => setEditForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="0"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">START</span>
              <input
                type="datetime-local"
                value={editForm.activeStartAt}
                onChange={(event) => setEditForm((current) => ({ ...current, activeStartAt: event.target.value }))}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">EXP</span>
              <input
                type="datetime-local"
                value={editForm.activeExpiresAt}
                onChange={(event) => setEditForm((current) => ({ ...current, activeExpiresAt: event.target.value }))}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold tracking-[0.18em] text-text-muted">GARANSI EXP</span>
              <input
                type="datetime-local"
                value={editForm.warrantyExpiresAt}
                onChange={(event) => setEditForm((current) => ({ ...current, warrantyExpiresAt: event.target.value }))}
              />
            </label>
          </div>

          <button
            className="inline-flex w-full items-center justify-center rounded-[18px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "MENYIMPAN..." : "SIMPAN PERUBAHAN"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
