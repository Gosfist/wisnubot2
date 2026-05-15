import { Copy, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  getCustomTransactionPlaceholders,
  normalizeCustomTransactionPlaceholderSlug,
  saveCustomTransactionPlaceholders,
  type CustomTransactionPlaceholder,
} from "../../lib/transactionMessageTemplate";
import { useToast } from "../../hooks/useToast";

const SYSTEM_PLACEHOLDERS = [
  ["{idTrx}", "ID transaksi"],
  ["{nomorWa}", "Nomor WhatsApp customer"],
  ["{nominal}", "Nominal transaksi"],
  ["{platform}", "Sumber transaksi: whatsapp, shopee, dll"],
  ["{saluran}", "Link saluran testimoni dari Settings"],
  ["{jam}", "Jam saat pesan dibuat"],
  ["{tanggal}", "Tanggal saat pesan dibuat"],
  ["{doneAt}", "Tanggal dan jam transaksi selesai"],
  ["{masaAktif}", "Durasi masa aktif"],
  ["{activeStart}", "Tanggal mulai masa aktif"],
  ["{activeExp}", "Tanggal expired masa aktif"],
  ["{masaGaransi}", "Durasi masa garansi"],
  ["{garansiStart}", "Tanggal mulai garansi"],
  ["{garansiExp}", "Tanggal expired garansi"],
];

export function DocumentationPage() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"system" | "custom">("system");
  const [customItems, setCustomItems] = useState<CustomTransactionPlaceholder[]>(() => getCustomTransactionPlaceholders());
  const [customSlug, setCustomSlug] = useState("");
  const [customValue, setCustomValue] = useState("");

  async function handleCopy(value: string) {
    await copyTextToClipboard(value);
    showToast("Placeholder disalin.", "success");
  }

  function persistCustomItems(items: CustomTransactionPlaceholder[]) {
    setCustomItems(items);
    saveCustomTransactionPlaceholders(items);
  }

  function handleSaveCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = normalizeCustomTransactionPlaceholderSlug(customSlug);
    if (!slug) {
      showToast("Nama slug wajib diisi.", "danger");
      return;
    }

    const nextItems = [
      ...customItems.filter((item) => item.slug !== slug),
      { slug, value: customValue },
    ];
    persistCustomItems(nextItems);
    setCustomSlug("");
    setCustomValue("");
    showToast("Placeholder custom berhasil disimpan.", "success");
  }

  function handleDeleteCustom(slug: string) {
    persistCustomItems(customItems.filter((item) => item.slug !== slug));
    showToast("Placeholder custom dihapus.", "success");
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Dokumentasi" subtitle="Placeholder untuk template pesan transaksi." />

      <SurfaceCard className="space-y-4">
        <label className="block max-w-xs space-y-2">
          <span className="text-sm font-semibold text-text-secondary">Jenis Dokumentasi</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as "system" | "custom")}>
            <option value="system">System</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {mode === "system" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {SYSTEM_PLACEHOLDERS.map(([token, description]) => (
              <button
                key={token}
                type="button"
                onClick={() => handleCopy(token)}
                className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-3 rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.58)] px-4 py-3 text-left transition hover:border-[rgba(56,189,248,0.36)]"
                title="Salin placeholder"
              >
                <span className="min-w-0">
                  <strong className="block break-all text-sm text-white">{token}</strong>
                  <span className="mt-1 block text-xs text-text-secondary">{description}</span>
                </span>
                <Copy size={16} className="text-accent" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <form className="grid gap-3 md:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_auto]" onSubmit={handleSaveCustom}>
              <input
                value={customSlug}
                onChange={(event) => setCustomSlug(event.target.value)}
                placeholder="contoh: produkgemini"
              />
              <input
                value={customValue}
                onChange={(event) => setCustomValue(event.target.value)}
                placeholder="contoh: Gemini"
              />
              <button
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] bg-linear-to-r from-primary to-accent px-4 text-sm font-bold text-white shadow-glow"
                type="submit"
              >
                <Save size={16} />
                Simpan
              </button>
            </form>

            <div className="grid gap-2 md:grid-cols-2">
              {customItems.length === 0 ? (
                <div className="rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.58)] px-4 py-5 text-sm text-text-secondary">
                  Belum ada placeholder custom.
                </div>
              ) : (
                customItems.map((item) => {
                  const token = `{${item.slug}}`;
                  return (
                    <div
                      key={item.slug}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.58)] px-4 py-3"
                    >
                      <button className="min-w-0 text-left" type="button" onClick={() => handleCopy(token)}>
                        <strong className="block break-all text-sm text-white">{token}</strong>
                        <span className="mt-1 block break-words text-xs text-text-secondary">{item.value || "-"}</span>
                      </button>
                      <button type="button" onClick={() => handleCopy(token)} title="Salin placeholder">
                        <Copy size={16} className="text-accent" />
                      </button>
                      <button type="button" onClick={() => handleDeleteCustom(item.slug)} title="Hapus placeholder">
                        <Trash2 size={16} className="text-danger" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
