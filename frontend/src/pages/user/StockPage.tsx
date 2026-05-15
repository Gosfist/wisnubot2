import { Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { CsStockModel, CsStockSummaryModel } from "../../types/models";

interface StockRow extends CsStockModel {
  commandName: string;
}

const BLOCKED_COMMANDS = new Set(["start", "welcome"]);

function isStockCommand(row: CsStockSummaryModel) {
  return row.deliveryMode === "stock" && !BLOCKED_COMMANDS.has(row.commandName.trim().toLowerCase());
}

export function StockPage() {
  const appData = useAppData();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<CsStockSummaryModel[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCsId, setSelectedCsId] = useState<number>(0);
  const [newContent, setNewContent] = useState("");
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [editContent, setEditContent] = useState("");

  const stockCommands = useMemo(() => summary.filter(isStockCommand), [summary]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      `/${row.commandName} ${row.content}`.toLowerCase().includes(keyword),
    );
  }, [query, rows]);

  async function refreshStock() {
    setLoading(true);
    try {
      const nextSummary = await appData.fetchStocksSummary();
      const commands = nextSummary.filter(isStockCommand);
      const lists = await Promise.all(
        commands.map(async (command) => {
          const items = await appData.fetchStocksForCs(command.csId);
          return items
            .filter((item) => !item.isUsed)
            .map((item) => ({ ...item, commandName: command.commandName }));
        }),
      );
      setSummary(nextSummary);
      setRows(lists.flat());
      setSelectedCsId((current) => {
        if (current && commands.some((command) => command.csId === current)) return current;
        return commands[0]?.csId ?? 0;
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat stock", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd() {
    const content = newContent.trim();
    if (!selectedCsId) {
      showToast("Pilih perintah terlebih dahulu.", "danger");
      return;
    }
    if (!content) {
      showToast("Data akun wajib diisi.", "danger");
      return;
    }

    setBusy(true);
    try {
      const result = await appData.addStocks(selectedCsId, content);
      showToast(result.message, "success");
      setNewContent("");
      setIsAddOpen(false);
      await refreshStock();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menambah stock", "danger");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(row: StockRow) {
    setEditing(row);
    setEditContent(row.content);
  }

  async function handleEdit() {
    if (!editing) return;
    const content = editContent.trim();
    if (!content) {
      showToast("Data akun wajib diisi.", "danger");
      return;
    }

    setBusy(true);
    try {
      await appData.updateStock(editing.id, content);
      showToast("Stock berhasil diperbarui.", "success");
      setEditing(null);
      setEditContent("");
      await refreshStock();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui stock", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row: StockRow) {
    if (!window.confirm(`Hapus stock /${row.commandName}?`)) return;
    setBusy(true);
    try {
      const message = await appData.deleteStock(row.id);
      showToast(message, "success");
      await refreshStock();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus stock", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Stock" />

      <SurfaceCard>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative flex min-h-[48px] w-full items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 md:max-w-[520px]">
            <Search className="pointer-events-none absolute left-5 text-text-secondary" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari perintah / data akun"
              className="h-full w-full rounded-none border-0 bg-transparent py-0 pl-9 pr-3 text-sm text-white outline-none placeholder:text-text-muted focus:border-0"
            />
          </label>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            disabled={stockCommands.length === 0}
            className="inline-flex items-center gap-2 rounded-[18px] bg-linear-to-r from-primary to-accent px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} /> Add Stock
          </button>
        </div>

        {loading ? null : stockCommands.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-secondary">
            Belum ada perintah dengan mode <strong>Pakai Stock</strong>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed text-left">
              <colgroup>
                <col className="w-[220px]" />
                <col />
                <col className="w-[132px]" />
              </colgroup>
              <thead>
                <tr className="text-sm font-bold text-white">
                  <th className="px-3 py-4">Perintah</th>
                  <th className="px-3 py-4">Data Akun</th>
                  <th className="px-3 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-sm text-text-secondary">
                      Stock belum ada.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-[rgba(148,163,184,0.12)] text-base font-semibold text-white">
                      <td className="px-3 py-4">/{row.commandName}</td>
                      <td className="px-3 py-4">
                        <div title={row.content} className="max-w-full truncate whitespace-nowrap text-text-primary">
                          {row.content}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            disabled={busy}
                            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(56,189,248,0.3)] text-accent hover:bg-[rgba(56,189,248,0.08)] disabled:opacity-50"
                            aria-label="Edit stock"
                            title="Edit stock"
                          >
                            <Edit3 size={17} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(row)}
                            disabled={busy}
                            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[rgba(244,63,94,0.35)] text-danger hover:bg-[rgba(244,63,94,0.08)] disabled:opacity-50"
                            aria-label="Hapus stock"
                            title="Hapus stock"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      {isAddOpen && (
        <StockDialog
          title="Add Stock"
          commandOptions={stockCommands}
          selectedCsId={selectedCsId}
          onSelectedCsIdChange={setSelectedCsId}
          content={newContent}
          onContentChange={setNewContent}
          onClose={() => setIsAddOpen(false)}
          onSubmit={() => void handleAdd()}
          busy={busy}
          submitLabel="Simpan Stock"
        />
      )}

      {editing && (
        <StockDialog
          title="Edit Stock"
          commandOptions={stockCommands}
          selectedCsId={editing.csId}
          onSelectedCsIdChange={() => undefined}
          content={editContent}
          onContentChange={setEditContent}
          onClose={() => setEditing(null)}
          onSubmit={() => void handleEdit()}
          busy={busy}
          submitLabel="Update Stock"
          lockCommand
        />
      )}
    </div>
  );
}

interface StockDialogProps {
  title: string;
  commandOptions: CsStockSummaryModel[];
  selectedCsId: number;
  onSelectedCsIdChange: (value: number) => void;
  content: string;
  onContentChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  submitLabel: string;
  lockCommand?: boolean;
}

function StockDialog({
  title,
  commandOptions,
  selectedCsId,
  onSelectedCsIdChange,
  content,
  onContentChange,
  onClose,
  onSubmit,
  busy,
  submitLabel,
  lockCommand = false,
}: StockDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-t-[24px] border border-[rgba(56,189,248,0.22)] bg-[#0b1220] shadow-2xl sm:rounded-[24px]">
        <div className="flex items-center justify-between border-b border-[rgba(56,189,248,0.15)] px-5 py-4">
          <div className="text-lg font-bold text-white">{title}</div>
          <button onClick={onClose} className="rounded-full p-2 text-text-secondary hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Perintah</span>
            <select
              value={selectedCsId}
              onChange={(event) => onSelectedCsIdChange(Number(event.target.value))}
              disabled={lockCommand || busy}
              className="h-[54px] w-full rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 text-base font-semibold text-white outline-none focus:border-[rgba(56,189,248,0.45)] disabled:opacity-70"
            >
              {commandOptions.map((option) => (
                <option key={option.csId} value={option.csId}>
                  /{option.commandName}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Data Akun</span>
            <textarea
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              className="min-h-[150px] w-full rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-3 text-sm font-semibold text-white outline-none focus:border-[rgba(56,189,248,0.45)]"
              placeholder="email@gmail.com | password | catatan"
            />
          </label>

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-linear-to-r from-primary to-accent text-sm font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
