import { Copy, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "../../components/SurfaceCard";
import { DEFAULT_TRANSACTION_MESSAGE_TEMPLATE } from "../../lib/transactionMessageTemplate";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";

export function TransactionMessageTemplatePage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [template, setTemplate] = useState(DEFAULT_TRANSACTION_MESSAGE_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await appData.fetchSettings();
        if (mounted) {
          setTemplate(settings.transactionMessageTemplate || DEFAULT_TRANSACTION_MESSAGE_TEMPLATE);
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
        transactionMessageTemplate: template.trim(),
      });
      setTemplate(settings.transactionMessageTemplate || DEFAULT_TRANSACTION_MESSAGE_TEMPLATE);
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

  const placeholders = ["{activeExp}", "{garansiExp}", "{idTrx}", "{akunGoogle}", "{emailBuyer}", "{nominal}"];

  return (
    <SurfaceCard>
      <form className="space-y-4" onSubmit={handleSave}>
        <div>
          <h3 className="text-lg font-bold">Template Pesan</h3>
        </div>

        {loading ? null : (
          <>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Isi Pesan</span>
              <textarea
                className="min-h-[320px] font-mono text-sm leading-6"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[rgba(15,23,42,0.96)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
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
