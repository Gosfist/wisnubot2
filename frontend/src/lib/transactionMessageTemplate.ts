import type { TransactionModel } from "../types/models";

export const DEFAULT_TRANSACTION_MESSAGE_TEMPLATE =
  "Exp akun {activeExp}\n\n" +
  "Informasi :\n" +
  "- segera klick terima pesanan dan B5 max 2 hari, lebih dari 2hari akun\n" +
  "google kembali ke free\n" +
  "- tidak keluar family, keluar = hangus\n" +
  "- exp garansi {garansiExp}\n\n" +
  "Terimakasih sudah belanja di starcloud kami tunggu orderan selanjutnya\n" +
  "kak.";

function formatDateId(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDateTimeId(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function renderTransactionMessageTemplate(template: string, transaction: TransactionModel) {
  const source = template.trim() || DEFAULT_TRANSACTION_MESSAGE_TEMPLATE;
  const data: Record<string, string> = {
    idTrx: transaction.idTrx,
    idtrx: transaction.idTrx,
    orderId: transaction.idTrx,
    produk: transaction.commandName ?? transaction.googleAccountEmail ?? "",
    commandName: transaction.commandName ?? "",
    akunGoogle: transaction.googleAccountEmail ?? "",
    emailBuyer: transaction.buyerEmail ?? transaction.customerJid.replace("@s.whatsapp.net", ""),
    nominal: transaction.amount.toLocaleString("id-ID"),
    amount: String(transaction.amount),
    platform: transaction.platform,
    status: transaction.status,
    doneAt: formatDateTimeId(transaction.completedAt ?? transaction.deliveredAt ?? transaction.paidAt),
    activeStart: formatDateId(transaction.activeStartAt),
    activeExp: formatDateId(transaction.activeExpiresAt),
    activeExpiresAt: formatDateId(transaction.activeExpiresAt),
    garansiStart: formatDateId(transaction.warrantyStartAt),
    garansiExp: formatDateId(transaction.warrantyExpiresAt),
    warrantyStart: formatDateId(transaction.warrantyStartAt),
    warrantyExp: formatDateId(transaction.warrantyExpiresAt),
    masaAktif: transaction.activeDurationDays ? `${transaction.activeDurationDays} hari` : "-",
    masaGaransi: transaction.warrantyDurationDays ? `${transaction.warrantyDurationDays} hari` : "-",
  };

  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_match, a, b) => {
    const key = String(a || b);
    return data[key] ?? data[key.toLowerCase()] ?? "";
  });
}
