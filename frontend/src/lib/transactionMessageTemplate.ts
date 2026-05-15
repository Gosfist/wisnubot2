import type { TransactionModel } from "../types/models";

export const DEFAULT_TRANSACTION_MESSAGE_TEMPLATE = "";

export const DEFAULT_WHATSAPP_TRANSACTION_MESSAGE_TEMPLATE = DEFAULT_TRANSACTION_MESSAGE_TEMPLATE;

export type TransactionMessageTemplatePlatform = "shopee" | "whatsapp";

export type TransactionMessageTemplateConfig = Record<TransactionMessageTemplatePlatform, string>;

export type CustomTransactionPlaceholder = {
  slug: string;
  value: string;
};

export const CUSTOM_TRANSACTION_PLACEHOLDERS_STORAGE_KEY = "wisnubot2_custom_transaction_placeholders";

const DEFAULT_CUSTOM_TRANSACTION_PLACEHOLDERS: CustomTransactionPlaceholder[] = [
  { slug: "produkgemini", value: "Gemini" },
];

export function normalizeCustomTransactionPlaceholderSlug(value: string) {
  return String(value)
    .trim()
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

export function getCustomTransactionPlaceholders(): CustomTransactionPlaceholder[] {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_TRANSACTION_PLACEHOLDERS;
  const raw = window.localStorage.getItem(CUSTOM_TRANSACTION_PLACEHOLDERS_STORAGE_KEY);
  if (raw === null) return DEFAULT_CUSTOM_TRANSACTION_PLACEHOLDERS;

  try {
    const parsed = JSON.parse(raw) as CustomTransactionPlaceholder[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        slug: normalizeCustomTransactionPlaceholderSlug(item.slug),
        value: String(item.value ?? ""),
      }))
      .filter((item) => item.slug);
  } catch {
    return [];
  }
}

export function saveCustomTransactionPlaceholders(items: CustomTransactionPlaceholder[]) {
  if (typeof window === "undefined") return;
  const normalized = items
    .map((item) => ({
      slug: normalizeCustomTransactionPlaceholderSlug(item.slug),
      value: String(item.value ?? ""),
    }))
    .filter((item) => item.slug);
  window.localStorage.setItem(CUSTOM_TRANSACTION_PLACEHOLDERS_STORAGE_KEY, JSON.stringify(normalized));
}

export function normalizeTransactionTemplatePlatform(platform?: string | null): TransactionMessageTemplatePlatform {
  return String(platform ?? "").trim().toLowerCase() === "whatsapp" ? "whatsapp" : "shopee";
}

export function parseTransactionMessageTemplates(value?: string | null): TransactionMessageTemplateConfig {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      shopee: "",
      whatsapp: "",
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TransactionMessageTemplateConfig>;
    return {
      shopee: String(parsed.shopee ?? ""),
      whatsapp: String(parsed.whatsapp ?? ""),
    };
  } catch {
    return {
      shopee: raw,
      whatsapp: raw,
    };
  }
}

export function serializeTransactionMessageTemplates(templates: TransactionMessageTemplateConfig) {
  return JSON.stringify({
    shopee: templates.shopee.trim(),
    whatsapp: templates.whatsapp.trim(),
  });
}

export function getTransactionMessageTemplateForPlatform(value: string | null | undefined, platform?: string | null) {
  const templates = parseTransactionMessageTemplates(value);
  return templates[normalizeTransactionTemplatePlatform(platform)] || DEFAULT_TRANSACTION_MESSAGE_TEMPLATE;
}

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

export function renderTransactionMessageTemplate(
  template: string,
  transaction: TransactionModel,
  context: { saluran?: string } = {},
) {
  const source = template.trim() || DEFAULT_TRANSACTION_MESSAGE_TEMPLATE;
  const now = new Date();
  const data: Record<string, string> = {
    idTrx: transaction.idTrx,
    idtrx: transaction.idTrx,
    orderId: transaction.idTrx,
    produk: transaction.commandName ?? transaction.googleAccountEmail ?? "",
    commandName: transaction.commandName ?? "",
    akunGoogle: transaction.googleAccountEmail ?? "",
    emailBuyer: transaction.buyerEmail ?? transaction.customerJid.replace("@s.whatsapp.net", ""),
    nomorWa: transaction.customerJid.replace("@s.whatsapp.net", ""),
    nominal: transaction.amount.toLocaleString("id-ID"),
    amount: String(transaction.amount),
    platform: transaction.platform,
    status: transaction.status,
    saluran: context.saluran ?? "",
    linkSaluran: context.saluran ?? "",
    tanggal: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(now),
    jam: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(now),
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
  for (const item of getCustomTransactionPlaceholders()) {
    data[item.slug] = item.value;
  }

  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_match, a, b) => {
    const key = String(a || b);
    return data[key] ?? data[key.toLowerCase()] ?? "";
  });
}
