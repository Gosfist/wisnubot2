import { Edit2, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { TransactionModel } from "../../types/models";

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

function formatCustomer(value: string) {
  return String(value ?? "").replace("@s.whatsapp.net", "") || "-";
}

function toDateInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getPurchaseLabel(item: TransactionModel) {
  return item.commandName || item.stockContent || item.platform || "-";
}

function getPaymentGatewayLabel(item: TransactionModel) {
  return item.paymentGatewayOrderId || "-";
}

export function BotWaTransactionsPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<TransactionModel | null>(null);
  const [editForm, setEditForm] = useState({
    idTrx: "",
    customerJid: "",
    warrantyExpiresAt: "",
    warrantyStatus: "open" as TransactionModel["warrantyStatus"],
  });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const transactions = await appData.fetchTransactions();
    setItems(transactions.filter((item) => !item.isManual));
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const transactions = await appData.fetchTransactions();
        if (!mounted) return;
        setItems(transactions.filter((item) => !item.isManual));
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Gagal memuat TRX Bot WA.", "danger");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [appData.trxGeminiVersion, showToast]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = [...items].sort((a, b) => {
      const aTime = new Date(a.paidAt ?? a.createdAt ?? "").getTime();
      const bTime = new Date(b.paidAt ?? b.createdAt ?? "").getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

    if (!keyword) return rows;

    return rows.filter((item) => {
      const text = [
        item.idTrx,
        getPurchaseLabel(item),
        item.customerJid,
        item.platform,
        item.status,
      ].join(" ").toLowerCase();
      return text.includes(keyword);
    });
  }, [items, query]);

  function openEdit(item: TransactionModel) {
    setEditingItem(item);
    setEditForm({
      idTrx: item.idTrx,
      customerJid: formatCustomer(item.customerJid),
      warrantyExpiresAt: toDateInput(item.warrantyExpiresAt),
      warrantyStatus: item.warrantyStatus,
    });
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    if (!editForm.idTrx.trim()) {
      showToast("idTRX wajib diisi.", "danger");
      return;
    }
    if (!editForm.customerJid.trim()) {
      showToast("WA pembeli wajib diisi.", "danger");
      return;
    }

    setSaving(true);
    try {
      await appData.updateTransaction(editingItem.id, {
        mode: "bot_wa",
        idTrx: editForm.idTrx.trim(),
        customerJid: editForm.customerJid.trim(),
        warrantyExpiresAt: editForm.warrantyExpiresAt,
        warrantyStatus: editForm.warrantyStatus,
      });
      await reload();
      setEditingItem(null);
      showToast("TRX Bot WA berhasil diperbarui.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui TRX Bot WA.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: TransactionModel) {
    if (!window.confirm(`Hapus TRX Bot WA ${item.idTrx}?`)) return;

    setSaving(true);
    try {
      await appData.deleteTransaction(item.id);
      setItems((current) => current.filter((tx) => tx.id !== item.id));
      showToast("TRX Bot WA berhasil dihapus.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus TRX Bot WA.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="TRX Bot WA" />

      <SurfaceCard className="space-y-4">
        <label className="relative flex min-h-[48px] max-w-[420px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4">
          <Search size={18} className="pointer-events-none absolute left-5 text-text-secondary" />
          <input
            className="h-full w-full rounded-none border-0 bg-transparent py-0 pl-9 pr-3 text-sm text-white outline-none placeholder:text-text-muted focus:border-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari idTRX / pembelian / nomor"
          />
        </label>

        {loading ? null : (
          <div className="overflow-x-hidden">
            <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="text-[12px] font-extrabold text-white">
                <tr>
                  <th className="px-3 py-3">idTRX</th>
                  <th className="px-3 py-3">Payment Gateway</th>
                  <th className="px-3 py-3">Pembelian</th>
                  <th className="px-3 py-3">WA Pembeli</th>
                  <th className="px-3 py-3">Garansi</th>
                  <th className="px-3 py-3">Status Garansi</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-text-secondary">
                      Belum ada pembelian dari Bot WA.
                    </td>
                  </tr>
                ) : filteredItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                    <td className="px-3 py-2.5 font-semibold text-white">
                      <span className="block truncate" title={item.idTrx}>{item.idTrx}</span>
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">
                      <span className="block truncate" title={getPaymentGatewayLabel(item)}>
                        {getPaymentGatewayLabel(item)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">
                      <span className="block truncate" title={getPurchaseLabel(item)}>
                        {getPurchaseLabel(item)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">
                      <span className="block truncate" title={formatCustomer(item.customerJid)}>
                        {formatCustomer(item.customerJid)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">
                      <span className="block truncate" title={formatDate(item.warrantyExpiresAt)}>
                        {formatDate(item.warrantyExpiresAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          item.warrantyStatus === "selesai"
                            ? "inline-flex min-w-[70px] justify-center rounded-[10px] bg-[rgba(34,197,94,0.16)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-success"
                            : "inline-flex min-w-[70px] justify-center rounded-[10px] bg-[rgba(56,189,248,0.14)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-accent"
                        }
                      >
                        {item.warrantyStatus === "selesai" ? "SELESAI" : "OPEN"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center gap-2">
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(56,189,248,0.22)] text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                          type="button"
                          onClick={() => openEdit(item)}
                          aria-label="Edit TRX Bot WA"
                          title="Edit TRX Bot WA"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(244,63,94,0.24)] text-danger transition hover:bg-[rgba(244,63,94,0.08)]"
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete(item)}
                          aria-label="Hapus TRX Bot WA"
                          title="Hapus TRX Bot WA"
                        >
                          <Trash2 size={15} />
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
        title="Edit TRX Bot WA"
        onClose={() => setEditingItem(null)}
      >
        <form className="space-y-4" onSubmit={handleSaveEdit}>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">idTRX</span>
            <input
              value={editForm.idTrx}
              onChange={(event) => setEditForm((current) => ({ ...current, idTrx: event.target.value }))}
              placeholder="TRX-12"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">WA Pembeli</span>
            <input
              value={editForm.customerJid}
              onChange={(event) => setEditForm((current) => ({ ...current, customerJid: event.target.value }))}
              placeholder="6281234567890"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Garansi</span>
            <input
              type="date"
              value={editForm.warrantyExpiresAt}
              onChange={(event) => setEditForm((current) => ({ ...current, warrantyExpiresAt: event.target.value }))}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Status Garansi</span>
            <select
              value={editForm.warrantyStatus}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  warrantyStatus: event.target.value === "selesai" ? "selesai" : "open",
                }))
              }
            >
              <option value="open">Open</option>
              <option value="selesai">Selesai</option>
            </select>
          </label>

          <button
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
