import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import { formatCurrency, formatDate } from "../../lib/format";
import type { GoogleAccountModel, TransactionModel } from "../../types/models";

function formatProductName(value: string | null) {
  if (!value) return "-";
  const normalized = value.replace(/^\/+/, "").trim();
  if (!normalized) return "-";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getGoogleAccountTotalSlots(item: GoogleAccountModel) {
  return /\|\s*full\s+private\b/i.test(item.email) ? 1 : item.totalSlots;
}

export function SalesDashboardPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<TransactionModel[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [nextTransactions, nextGoogleAccounts] = await Promise.all([
          appData.fetchTransactions(),
          appData.fetchGoogleAccounts(),
        ]);

        if (!mounted) return;
        setTransactions(nextTransactions);
        setGoogleAccounts(nextGoogleAccounts);
      } catch (err) {
        if (!mounted) return;
        showToast(err instanceof Error ? err.message : "Gagal memuat informasi penjualan.", "danger");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRevenue = useMemo(
    () => transactions.reduce((sum, item) => sum + item.amount, 0),
    [transactions],
  );

  const availableGoogleSlots = useMemo(
    () =>
      googleAccounts.reduce((sum, item) => {
        if (item.isSuspended) return sum;
        const totalSlots = getGoogleAccountTotalSlots(item);
        const usedSlots = Math.min(Math.max(item.usedSlots, 0), totalSlots);
        return sum + Math.max(totalSlots - usedSlots, 0);
      }, 0),
    [googleAccounts],
  );

  const totalBuyerCount = useMemo(
    () => transactions.reduce((sum, item) => sum + Math.max(1, Number(item.buyerCount ?? 1)), 0),
    [transactions],
  );

  const platformStats = useMemo(() => {
    const initial = { shopee: 0, whatsapp: 0, pribadi: 0 };
    return transactions.reduce((stats, item) => {
      const platform = String(item.platform ?? "").trim().toLowerCase();
      const count = Math.max(1, Number(item.buyerCount ?? 1));
      if (platform === "whatsapp" || platform === "wa") {
        stats.whatsapp += count;
      } else if (platform === "pribadi") {
        stats.pribadi += count;
      } else {
        stats.shopee += count;
      }
      return stats;
    }, initial);
  }, [transactions]);

  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="Informasi penjualan Gemini dan ketersediaan akun." />

      {loading ? (
        null
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Penjualan" value={`Rp ${formatCurrency(totalRevenue)}`} />
            <StatCard label="Jumlah TRX Gemini" value={String(totalBuyerCount)} />
            <StatCard label="Akun Google" value={String(googleAccounts.length)} />
            <StatCard label="Slot Tersedia" value={String(availableGoogleSlots)} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="TRX Shopee" value={String(platformStats.shopee)} />
            <StatCard label="TRX WhatsApp" value={String(platformStats.whatsapp)} />
            <StatCard label="TRX Pribadi" value={String(platformStats.pribadi)} />
          </div>

          <SurfaceCard className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Transaksi Terbaru</h2>
                <p className="mt-1 text-sm text-text-secondary">Ringkasan penjualan terakhir dari TRX Gemini.</p>
              </div>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="rounded-[18px] border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.5)] px-4 py-5 text-sm text-text-secondary">
                Belum ada transaksi.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.16em] text-text-muted">
                    <tr>
                      <th className="px-3 py-3">IDTRX</th>
                      <th className="px-3 py-3">Produk</th>
                      <th className="px-3 py-3">Tanggal</th>
                      <th className="px-3 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                    {recentTransactions.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 font-semibold text-white">{item.idTrx}</td>
                        <td className="px-3 py-3 text-text-secondary">{formatProductName(item.commandName)}</td>
                        <td className="px-3 py-3 text-text-secondary">{formatDate(item.paidAt ?? item.createdAt)}</td>
                        <td className="px-3 py-3 text-right font-bold text-white">
                          Rp {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SurfaceCard>
        </>
      )}
    </div>
  );
}
