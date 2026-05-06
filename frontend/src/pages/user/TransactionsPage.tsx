import { CheckCircle2, Edit2, ReceiptText, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { formatCurrency } from "../../lib/format";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { TransactionModel } from "../../types/models";

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

export function TransactionsPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editingItem, setEditingItem] = useState<TransactionModel | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
        const data = await appData.fetchTransactions();
        if (mounted) setItems(data);
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
      <PageHeader title="Transaksi" />

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
                <col className="w-[17%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="bg-[rgba(15,23,42,0.76)] text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                <tr>
                  <th className="px-3 py-4">idTrx</th>
                  <th className="px-3 py-4">Produk</th>
                  <th className="px-3 py-4">Platform</th>
                  <th className="px-3 py-4">Bayar</th>
                  <th className="px-3 py-4">Kirim</th>
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
                      {formatDateTime(item.paidAt ?? item.createdAt)}
                    </td>
                    <td className="break-words px-3 py-4 text-text-secondary">
                      {formatDateTime(item.deliveredAt)}
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
