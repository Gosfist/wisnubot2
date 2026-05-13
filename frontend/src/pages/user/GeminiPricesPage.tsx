import { Edit2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { formatCurrency } from "../../lib/format";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GeminiPricePlanModel } from "../../types/models";

function formatDurationLabel(days: number) {
  if (days % 30 === 0) return `${days / 30} Bulan`;
  return `${days} Hari`;
}

function defaultForm() {
  return {
    label: "",
    durationDays: "30",
    price: "",
    isActive: "true",
  };
}

export function GeminiPricesPage({ embedded = false }: { embedded?: boolean }) {
  const appData = useAppData();
  const { showToast } = useToast();
  const [items, setItems] = useState<GeminiPricePlanModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GeminiPricePlanModel | null>(null);
  const [form, setForm] = useState(defaultForm());

  async function refresh() {
    setLoading(true);
    try {
      const data = await appData.fetchGeminiPricePlans();
      setItems(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat harga Gemini", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appData.trxGeminiVersion]);

  const activeCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);

  function openCreateModal() {
    setEditingItem(null);
    setForm(defaultForm());
    setIsModalOpen(true);
  }

  function openEditModal(item: GeminiPricePlanModel) {
    setEditingItem(item);
    setForm({
      label: item.label,
      durationDays: String(item.durationDays),
      price: String(item.price),
      isActive: item.isActive ? "true" : "false",
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      label: form.label,
      durationDays: Number(form.durationDays),
      price: Number(form.price),
      isActive: form.isActive === "true",
    };

    setSaving(true);
    try {
      if (editingItem) {
        await appData.updateGeminiPricePlan(editingItem.id, payload);
        showToast("Harga Gemini berhasil diperbarui.", "success");
      } else {
        await appData.createGeminiPricePlan(payload);
        showToast("Harga Gemini berhasil disimpan.", "success");
      }
      const nextItems = await appData.fetchGeminiPricePlans();
      setItems(nextItems);
      setIsModalOpen(false);
      setEditingItem(null);
      setForm(defaultForm());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan harga Gemini.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: GeminiPricePlanModel) {
    const confirmed = window.confirm(`Hapus harga ${item.label}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const message = await appData.deleteGeminiPricePlan(item.id);
      const nextItems = await appData.fetchGeminiPricePlans();
      setItems(nextItems);
      showToast(message, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus harga Gemini.", "danger");
    } finally {
      setSaving(false);
    }
  }

  const headerActions = (
    <button
      className="inline-flex items-center gap-2 rounded-[14px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow"
      type="button"
      onClick={openCreateModal}
    >
      <Plus size={18} /> Tambah Harga
    </button>
  );

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{activeCount} harga aktif</p>
          {headerActions}
        </div>
      ) : null}

      {loading ? null : items.length === 0 ? (
        <div className="rounded-[20px] border border-glass-border bg-[rgba(30,41,59,0.88)] py-10 text-center text-sm text-text-secondary">
          Belum ada harga Gemini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[rgba(56,189,248,0.16)]">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[rgba(15,23,42,0.78)] text-[12px] font-extrabold text-white">
              <tr>
                <th className="px-5 py-4">Nama</th>
                <th className="px-5 py-4">Masa Aktif</th>
                <th className="px-5 py-4">Harga</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.36)]">
              {items.map((item) => (
                <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                  <td className="px-5 py-4 font-semibold text-white">{item.label}</td>
                  <td className="px-5 py-4 text-text-primary">{formatDurationLabel(item.durationDays)}</td>
                  <td className="px-5 py-4 text-text-primary">Rp {formatCurrency(item.price)}</td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        item.isActive
                          ? "inline-flex min-w-[88px] justify-center rounded-[12px] bg-[rgba(34,197,94,0.16)] px-4 py-2 text-xs font-extrabold uppercase text-success"
                          : "inline-flex min-w-[88px] justify-center rounded-[12px] bg-[rgba(148,163,184,0.14)] px-4 py-2 text-xs font-extrabold uppercase text-text-secondary"
                      }
                    >
                      {item.isActive ? "AKTIF" : "NON AKTIF"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        className="inline-flex size-10 items-center justify-center rounded-[12px] border border-[rgba(56,189,248,0.22)] text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                        type="button"
                        onClick={() => openEditModal(item)}
                        aria-label="Edit harga"
                        title="Edit harga"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="inline-flex size-10 items-center justify-center rounded-[12px] border border-[rgba(244,63,94,0.24)] text-danger transition hover:bg-[rgba(244,63,94,0.08)]"
                        type="button"
                        disabled={saving}
                        onClick={() => void handleDelete(item)}
                        aria-label="Hapus harga"
                        title="Hapus harga"
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

      <Modal
        open={isModalOpen}
        title={editingItem ? "Edit Harga" : "Tambah Harga"}
        onClose={() => setIsModalOpen(false)}
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Nama</span>
            <input
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="contoh: 1 Bulan"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Masa Aktif</span>
            <select
              value={form.durationDays}
              onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))}
            >
              <option value="30">1 Bulan</option>
              <option value="60">2 Bulan</option>
              <option value="90">3 Bulan</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Harga</span>
            <input
              type="number"
              min="1"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              placeholder="10000"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Status</span>
            <select
              value={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value }))}
            >
              <option value="true">Aktif</option>
              <option value="false">Non Aktif</option>
            </select>
          </label>

          <button
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-[rgba(15,23,42,0.96)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan Harga"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
