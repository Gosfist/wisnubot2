import { Copy } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useToast } from "../../hooks/useToast";

const PLACEHOLDERS = [
  ["{idTrx}", "ID transaksi"],
  ["{produk}", "Nama produk/perintah"],
  ["{nomorWa}", "Nomor WhatsApp customer"],
  ["{nominal}", "Nominal transaksi"],
  ["{platform}", "Sumber transaksi: whatsapp, shopee, dll"],
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

const EXAMPLE =
  "idTrx: {idTrx}\nProduk: /{produk}\nPlatform: {platform}\nMasa aktif: {masaAktif}\nExp: {activeExp}\nGaransi sampai: {garansiExp}";

export function DocumentationPage() {
  const { showToast } = useToast();

  async function handleCopy(value: string) {
    await copyTextToClipboard(value);
    showToast("Placeholder disalin.", "success");
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Dokumentasi" subtitle="Placeholder untuk teks custom customer service dan transaksi." />

      <SurfaceCard className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          {PLACEHOLDERS.map(([token, description]) => (
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
      </SurfaceCard>

      <SurfaceCard className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-text-secondary">Contoh teks</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.7)] p-4 text-sm leading-6 text-white">
            {EXAMPLE}
          </pre>
        </div>
        <button
          type="button"
          onClick={() => handleCopy(EXAMPLE)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-2 text-sm font-semibold text-accent hover:bg-[rgba(56,189,248,0.08)]"
        >
          <Copy size={16} />
          Salin Contoh
        </button>
      </SurfaceCard>
    </div>
  );
}
