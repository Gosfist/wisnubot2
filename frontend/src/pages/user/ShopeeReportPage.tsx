import { Download, ExternalLink, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { useEffect, useMemo, useState } from "react";
import { SurfaceCard } from "../../components/SurfaceCard";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { TransactionModel } from "../../types/models";

const REPORT_FILENAME = "Permintaan Pengubahan Status Pesanan - Barang Non-Fisik.xlsx";
const PAGE_SIZE = 5;

export function ShopeeReportPage() {
  const appData = useAppData();
  const { showToast } = useToast();
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  async function refresh() {
    setLoading(true);
    try {
      const transactions = await appData.fetchTransactions();
      setItems(transactions);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat laporan Shopee", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appData.trxGeminiVersion]);

  const reportItems = useMemo(
    () => items.filter((item) => (
      String(item.platform ?? "").trim().toLowerCase() === "shopee" &&
      item.reportStatus === "proses"
    )),
    [items],
  );

  const totalPages = Math.max(Math.ceil(reportItems.length / PAGE_SIZE), 1);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return reportItems.slice(start, start + PAGE_SIZE);
  }, [currentPage, reportItems]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportItems.length]);

  function handleExport() {
    const proofHeader =
      "Bukti pembeli sudah menerima pesanan\n\n" +
      "- Screenshot yang menunjukkan pembeli sudah mengonfirmasi menerima produk non fisik.\n" +
      "Screenshot harus dari Chat di Shopee, screenshot dari platform lain (cth Whatsapp) tidak akan\n" +
      "diproses\n" +
      "- Masukkan foto kedalam google drive dan salin ulang link kedalam kolom dibawah ini\n" +
      "- Pastikan google drive tidak terkunci sehingga dapat diakses oleh Tim Shopee";
    const headerRows = [["No", "OrderSN/ Nomor\nPesanan", proofHeader]];
    const dataRows = reportItems.map((item, index) => [
      index + 1,
      item.idTrx,
      item.proofDriveUrl ?? "",
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);
    worksheet["!cols"] = [{ wch: 8 }, { wch: 26 }, { wch: 92 }];
    worksheet["!rows"] = [
      { hpt: 105 },
      ...dataRows.map(() => ({ hpt: 15 })),
    ];

    const border = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    };
    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:C1");
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = 0; col <= 2; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        if (!worksheet[address]) worksheet[address] = { t: "s", v: "" };
        worksheet[address].s = {
          border,
          font: { bold: row === 0 && col < 2, name: "Arial", sz: 10 },
          alignment: {
            horizontal: col === 0 ? "center" : "left",
            vertical: row === 0 && col < 2 ? "center" : "top",
            wrapText: row === 0 || col === 2,
          },
        };
      }
    }
    worksheet["B1"].s = {
      ...worksheet["B1"].s,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
    worksheet["C1"].s = {
      ...worksheet["C1"].s,
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
      font: { bold: false, name: "Arial", sz: 10 },
    };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, REPORT_FILENAME);
  }

  return (
    <SurfaceCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Laporan Shopee</h3>
          <p className="mt-1 text-sm text-text-secondary">{reportItems.length} transaksi Gemini via Shopee</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-[12px] border border-[rgba(56,189,248,0.18)] px-4 py-2.5 text-sm font-bold text-text-primary transition hover:bg-[rgba(56,189,248,0.08)]"
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-[12px] bg-[rgba(37,99,235,0.24)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[rgba(37,99,235,0.34)] disabled:opacity-60"
            type="button"
            onClick={handleExport}
            disabled={loading || reportItems.length === 0}
          >
            <Download size={16} />
            Export Excel
          </button>
        </div>
      </div>

      {loading ? null : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[72%]" />
              </colgroup>
              <thead className="text-[12px] font-extrabold text-white">
                <tr>
                  <th className="px-3 py-3">No Pesanan</th>
                  <th className="px-3 py-3">Link URL Drive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                {reportItems.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-sm text-text-secondary">
                      Belum ada transaksi Shopee untuk laporan.
                    </td>
                  </tr>
                ) : pageItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                    <td className="px-3 py-2.5 font-semibold text-white">{item.idTrx}</td>
                    <td className="px-3 py-2.5">
                      {item.proofDriveUrl ? (
                        <a
                          className="inline-flex max-w-full items-center gap-2 text-accent hover:text-white"
                          href={item.proofDriveUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={item.proofDriveUrl}
                        >
                          <ExternalLink size={15} className="shrink-0" />
                          <span className="truncate">{item.proofDriveUrl}</span>
                        </a>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reportItems.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm text-text-secondary">
              <button
                className="rounded-[10px] border border-[rgba(56,189,248,0.18)] px-3 py-1.5 text-text-secondary transition hover:bg-[rgba(56,189,248,0.08)] disabled:opacity-45"
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              >
                Prev
              </button>
              <button
                className="rounded-[10px] bg-[rgba(37,99,235,0.24)] px-3 py-1.5 font-bold text-white"
                type="button"
              >
                {currentPage}
              </button>
              {totalPages > 1 && currentPage !== totalPages ? (
                <button
                  className="rounded-[10px] border border-[rgba(56,189,248,0.18)] px-3 py-1.5 text-text-secondary transition hover:bg-[rgba(56,189,248,0.08)]"
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                >
                  {totalPages}
                </button>
              ) : null}
              <button
                className="rounded-[10px] border border-[rgba(56,189,248,0.18)] px-3 py-1.5 text-white transition hover:bg-[rgba(56,189,248,0.08)] disabled:text-text-muted disabled:opacity-45"
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </SurfaceCard>
  );
}
