import { CheckCircle2, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export function TransactionsPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [loading, setLoading] = useState(true);

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
        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <div className="size-10 rounded-full border-4 border-[rgba(56,189,248,0.12)] border-t-accent animate-spin-soft" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-secondary">Belum ada transaksi sukses.</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 rounded-[16px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.58)] px-4 py-3 md:grid-cols-[1.3fr_1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="break-all text-sm font-bold text-white">{item.idTrx}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    /{item.commandName ?? "-"} - {formatCustomerJid(item.customerJid)}
                  </div>
                </div>
                <div className="text-xs text-text-secondary md:text-right">
                  <div>Bayar: {formatDateTime(item.paidAt ?? item.createdAt)}</div>
                  <div>Kirim: {formatDateTime(item.deliveredAt)}</div>
                </div>
                <div className="flex items-center justify-between gap-3 md:block md:text-right">
                  <span className="rounded-full border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.12)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-success">
                    Sukses
                  </span>
                  <div className="mt-0 text-sm font-extrabold text-white md:mt-2">
                    Rp {formatCurrency(item.amount)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
