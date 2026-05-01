import { Boxes, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { CsStockModel, CsStockSummaryModel } from "../../types/models";

export function StockPage() {
  const appData = useAppData();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<CsStockSummaryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCsId, setOpenCsId] = useState<number | null>(null);
  const [openCsCommand, setOpenCsCommand] = useState<string>("");
  const [items, setItems] = useState<CsStockModel[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshSummary() {
    setLoading(true);
    try {
      const data = await appData.fetchStocksSummary();
      setSummary(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat stock", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openManager(row: CsStockSummaryModel) {
    setOpenCsId(row.csId);
    setOpenCsCommand(row.commandName);
    setItems([]);
    setBulkText("");
    try {
      const list = await appData.fetchStocksForCs(row.csId);
      setItems(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat stock", "danger");
    }
  }

  function closeManager() {
    setOpenCsId(null);
    setOpenCsCommand("");
    setItems([]);
    setBulkText("");
  }

  async function handleAdd() {
    if (!openCsId) return;
    const trimmed = bulkText.trim();
    if (!trimmed) {
      showToast("Isi minimal 1 baris stock.", "danger");
      return;
    }
    setBusy(true);
    try {
      const result = await appData.addStocks(openCsId, trimmed);
      showToast(result.message, "success");
      setBulkText("");
      const list = await appData.fetchStocksForCs(openCsId);
      setItems(list);
      await refreshSummary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menambah stock", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(stockId: number) {
    if (!openCsId) return;
    if (!window.confirm("Hapus item stock ini?")) return;
    setBusy(true);
    try {
      await appData.deleteStock(stockId);
      const list = await appData.fetchStocksForCs(openCsId);
      setItems(list);
      await refreshSummary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!openCsId) return;
    if (!window.confirm("Hapus SEMUA stock yang belum terpakai?")) return;
    setBusy(true);
    try {
      const msg = await appData.clearStocks(openCsId);
      showToast(msg, "success");
      const list = await appData.fetchStocksForCs(openCsId);
      setItems(list);
      await refreshSummary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus", "danger");
    } finally {
      setBusy(false);
    }
  }

  const stockEnabledRows = useMemo(
    () => summary.filter((s) => s.deliveryMode === "stock"),
    [summary],
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Stock Customer Service" />

      <SurfaceCard>
        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : stockEnabledRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-secondary">
            Belum ada perintah CS dengan mode <strong>Stock</strong>.
            <br />
            Buat perintah CS lalu pilih mode pengiriman <em>Pakai Stock</em>.
          </div>
        ) : (
          <div className="space-y-2">
            {stockEnabledRows.map((row) => {
              const lowStock = row.available <= 3;
              return (
                <button
                  key={row.csId}
                  onClick={() => void openManager(row)}
                  className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.6)] px-4 py-3 text-left transition hover:border-[rgba(56,189,248,0.4)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-[12px] bg-[rgba(56,189,248,0.12)] p-2 text-accent">
                      <Boxes size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">/{row.commandName}</div>
                      <div className="text-xs text-text-secondary">
                        {row.price !== null ? `Rp ${row.price.toLocaleString("id-ID")}` : "-"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={"text-sm font-bold " + (lowStock ? "text-danger" : "text-white")}>
                      {row.available}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-text-secondary">
                      tersedia / {row.total}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      {openCsId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-t-[24px] bg-[#0b1220] shadow-2xl sm:rounded-[24px]">
            <div className="flex items-center justify-between border-b border-[rgba(56,189,248,0.15)] px-5 py-4">
              <div>
                <div className="text-sm font-bold text-white">Stock /{openCsCommand}</div>
                <div className="text-xs text-text-secondary">{items.length} item total</div>
              </div>
              <button onClick={closeManager} className="rounded-full p-2 text-text-secondary hover:bg-white/10 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text-secondary">Tambah Stock (1 baris = 1 item)</span>
                <textarea
                  className="min-h-[120px] w-full rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-3 py-2 text-sm text-white outline-none focus:border-[rgba(56,189,248,0.4)]"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"akun1@mail.com|password123\nakun2@mail.com|password456"}
                />
                <button
                  onClick={() => void handleAdd()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-linear-to-r from-primary to-accent px-4 py-2.5 text-sm font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-60"
                >
                  <Plus size={16} /> Tambah Stock
                </button>
              </div>

              <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="py-6 text-center text-xs text-text-secondary">Belum ada stock.</div>
                ) : (
                  items.map((it) => (
                    <div
                      key={it.id}
                      className={
                        "flex items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-xs " +
                        (it.isUsed
                          ? "border-[rgba(244,63,94,0.16)] bg-[rgba(244,63,94,0.05)] text-text-secondary line-through"
                          : "border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.5)] text-white")
                      }
                    >
                      <span className="break-all font-mono">{it.content}</span>
                      {!it.isUsed && (
                        <button
                          onClick={() => void handleDelete(it.id)}
                          disabled={busy}
                          className="shrink-0 rounded-lg p-1.5 text-[rgba(244,63,94,0.7)] hover:bg-[rgba(244,63,94,0.1)] hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {items.some((it) => !it.isUsed) && (
                <button
                  onClick={() => void handleClear()}
                  disabled={busy}
                  className="w-full rounded-[14px] border border-[rgba(244,63,94,0.4)] px-3 py-2 text-xs font-bold text-danger hover:bg-[rgba(244,63,94,0.08)] disabled:opacity-60"
                >
                  Hapus Semua Stock Belum Terpakai
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
