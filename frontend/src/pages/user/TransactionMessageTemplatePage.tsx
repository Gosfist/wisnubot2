import { Copy, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "../../components/SurfaceCard";
import { cn } from "../../lib/cn";
import {
  parseTransactionMessageTemplates,
  serializeTransactionMessageTemplates,
  type TransactionMessageTemplateConfig,
  type TransactionMessageTemplatePlatform,
} from "../../lib/transactionMessageTemplate";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";

const templateTabs: { id: TransactionMessageTemplatePlatform; label: string }[] = [
  { id: "shopee", label: "Shopee" },
  { id: "whatsapp", label: "WhatsApp" },
];

export function TransactionMessageTemplatePage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TransactionMessageTemplatePlatform>("shopee");
  const [templates, setTemplates] = useState<TransactionMessageTemplateConfig>({
    shopee: "",
    whatsapp: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await appData.fetchSettings();
        if (mounted) {
          setTemplates(parseTransactionMessageTemplates(settings.transactionMessageTemplate));
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Gagal memuat template pesan", "danger");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const settings = await appData.updateSettings({
        transactionMessageTemplate: serializeTransactionMessageTemplates(templates),
      });
      setTemplates(parseTransactionMessageTemplates(settings.transactionMessageTemplate));
      showToast("Template pesan berhasil disimpan.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan template pesan.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyPlaceholder(value: string) {
    await navigator.clipboard.writeText(value);
    showToast("Placeholder disalin.", "success");
  }

  const placeholders = [
    "{masaAktif}",
    "{activeStart}",
    "{activeExp}",
    "{masaGaransi}",
    "{garansiStart}",
    "{garansiExp}",
    "{idTrx}",
    "{akunGoogle}",
    "{emailBuyer}",
    "{nominal}",
    "{saluran}",
  ];
  const activeTemplate = templates[activeTab];

  return (
    <SurfaceCard>
      <form className="space-y-4" onSubmit={handleSave}>
        <div>
          <h3 className="text-lg font-bold">Template Pesan</h3>
        </div>

        {loading ? null : (
          <>
            <div className="flex flex-wrap gap-2">
              {templateTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={cn(
                    "rounded-[14px] border px-5 py-3 text-sm font-bold transition",
                    activeTab === tab.id
                      ? "border-[rgba(37,99,235,0.36)] bg-[rgba(37,99,235,0.22)] text-white"
                      : "border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.62)] text-text-secondary hover:bg-[rgba(56,189,248,0.08)] hover:text-white",
                  )}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Isi Pesan {activeTab === "shopee" ? "Shopee" : "WhatsApp"}</span>
              <textarea
                className="min-h-[320px] font-mono text-sm leading-6"
                value={activeTemplate}
                onChange={(event) => {
                  const value = event.target.value;
                  setTemplates((current) => ({ ...current, [activeTab]: value }));
                }}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {placeholders.map((item) => (
                <button
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[rgba(56,189,248,0.18)] px-3 py-2 text-xs font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                  type="button"
                  onClick={() => void handleCopyPlaceholder(item)}
                >
                  <Copy size={13} />
                  {item}
                </button>
              ))}
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
              type="submit"
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "Menyimpan..." : "Simpan Template"}
            </button>
          </>
        )}
      </form>
    </SurfaceCard>
  );
}
