import { Edit2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { SurfaceCard } from "../../components/SurfaceCard";
import { formatCurrency } from "../../lib/format";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GeminiPricePlanModel } from "../../types/models";

function formatDurationLabel(days: number) {
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
  void embedded;
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

  function openCreateModal() {
    setEditingItem(null);
    setForm(defaultForm());
    setIsModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      label: form.label.trim(),
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
        showToast("Harga Gemini berhasil ditambahkan.", "success");
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
    if (!window.confirm(`Hapus harga "${item.label}"?`)) return;
    setSaving(true);
    try {
      await appData.deleteGeminiPricePlan(item.id);
      showToast("Harga Gemini berhasil dihapus.", "success");
      const nextItems = await appData.fetchGeminiPricePlans();
      setItems(nextItems);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus harga Gemini.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-linear-to-r from-primary to-accent px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
          type="button"
          onClick={openCreateModal}
          disabled={saving}
        >
          <Plus size={16} />
          Tambah Harga
        </button>
      </div>

      {loading ? null : items.length === 0 ? (
        <SurfaceCard className="py-10 text-center text-sm text-text-secondary">
          Belum ada harga Gemini.
        </SurfaceCard>
      ) : (
        <SurfaceCard className="p-3 lg:p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="text-[12px] font-extrabold text-white">
                <tr>
                  <th className="px-3 py-3">Nama</th>
                  <th className="px-3 py-3">Masa Aktif</th>
                  <th className="px-3 py-3">Harga</th>
                  <th className="px-2 py-3 text-center">Status</th>
                  <th className="px-2 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                {items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                    <td className="px-3 py-2.5 font-semibold text-white">{item.label}</td>
                    <td className="px-3 py-2.5 text-text-primary">{formatDurationLabel(item.durationDays)}</td>
                    <td className="px-3 py-2.5 text-text-primary">Rp {formatCurrency(item.price)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span
                        className={
                          item.isActive
                            ? "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(34,197,94,0.16)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-success"
                            : "inline-flex min-w-[76px] justify-center rounded-[10px] bg-[rgba(148,163,184,0.14)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-text-secondary"
                        }
                      >
                        {item.isActive ? "AKTIF" : "NON AKTIF"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center gap-2">
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(56,189,248,0.22)] text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                          type="button"
                          onClick={() => openEditModal(item)}
                          aria-label="Edit harga"
                          title="Edit harga"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(248,113,113,0.26)] text-danger transition hover:bg-[rgba(248,113,113,0.08)] disabled:opacity-50"
                          type="button"
                          onClick={() => void handleDelete(item)}
                          aria-label="Hapus harga"
                          title="Hapus harga"
                          disabled={saving}
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
          <p className="mt-3 text-sm text-text-secondary">{activeCount} harga aktif</p>
        </SurfaceCard>
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
              placeholder="contoh: SHP 45 Hari"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Masa Aktif</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.durationDays}
              onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))}
              placeholder="30"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-text-secondary">Harga</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              placeholder="10000"
              required
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
            className="inline-flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : editingItem ? "Simpan Harga" : "Tambah Harga"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
