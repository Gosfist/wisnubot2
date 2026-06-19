import { CalendarDays, ChevronDown, Copy, Download, Edit2, Plus, Search, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImportConfirmModal } from "../../components/ImportConfirmModal";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { copyTextToClipboard } from "../../lib/clipboard";
import { cn } from "../../lib/cn";
import { formatCurrency } from "../../lib/format";
import {
  DEFAULT_TRANSACTION_MESSAGE_TEMPLATE,
  getTransactionMessageTemplateForPlatform,
  renderTransactionMessageTemplate,
} from "../../lib/transactionMessageTemplate";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GeminiPricePlanModel, GoogleAccountModel, TransactionModel } from "../../types/models";

function formatCustomerJid(value: string) {
  return value.replace("@s.whatsapp.net", "");
}

function formatBuyerEmailDisplay(value: string) {
  return String(value ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim().replace(/@gmail\.com$/i, ""))
    .filter(Boolean)
    .join(", ");
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function getLocalDayEndTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(23, 59, 59, 999);
  return parsed.getTime();
}

function getActiveStatus(
  value: string | null,
  manualStatus?: TransactionModel["activeStatus"],
  platform?: string,
) {
  const isPribadi = String(platform ?? "").trim().toLowerCase() === "pribadi";
  if (manualStatus === "aktif" && isPribadi) return "Aktif";
  if (manualStatus === "expired") return "Expired";
  if (!value) return "Aktif";
  const expEndTime = getLocalDayEndTime(value);
  if (expEndTime === null) return "Aktif";
  return expEndTime >= Date.now() ? "Aktif" : "Expired";
}

function getGoogleAccountTotalSlots(item: GoogleAccountModel) {
  return /\|\s*full\s+private\b/i.test(item.email) ? 1 : item.totalSlots;
}

function getGoogleAccountUsedSlots(item: GoogleAccountModel) {
  return Math.min(Math.max(item.usedSlots, 0), getGoogleAccountTotalSlots(item));
}

function getGoogleAccountAvailableSlots(item: GoogleAccountModel) {
  return Math.max(getGoogleAccountTotalSlots(item) - getGoogleAccountUsedSlots(item), 0);
}

function isGoogleAccountAvailable(item: GoogleAccountModel) {
  return !item.isSuspended && getGoogleAccountAvailableSlots(item) > 0;
}

function sortAvailableGoogleAccounts(items: GoogleAccountModel[]) {
  return items
    .filter(isGoogleAccountAvailable)
    .sort((a, b) => {
      const availableDiff = getGoogleAccountAvailableSlots(a) - getGoogleAccountAvailableSlots(b);
      if (availableDiff !== 0) return availableDiff;
      return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
    });
}

function getDefaultPricePlanForPlatform(plans: GeminiPricePlanModel[], platform: string) {
  const normalizedPlatform = String(platform).trim().toLowerCase();
  const preferredLabel = normalizedPlatform === "whatsapp" ? "WA 1 Bulan" : "SHP 1 Bulan";
  return plans.find((plan) => plan.label.toLowerCase() === preferredLabel.toLowerCase())
    ?? plans.find((plan) => plan.durationDays === 30)
    ?? plans[0]
    ?? null;
}

function toDateOnlyInputValue(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toTodayInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getTransactionStartSortTime(item: TransactionModel) {
  const raw = item.activeStartAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function compareTransactionStart(a: TransactionModel, b: TransactionModel, newestFirst: boolean) {
  const timeA = getTransactionStartSortTime(a);
  const timeB = getTransactionStartSortTime(b);
  if (timeA === null && timeB === null) return a.idTrx.localeCompare(b.idTrx, "id", { numeric: true });
  if (timeA === null) return 1;
  if (timeB === null) return -1;
  return newestFirst ? timeB - timeA : timeA - timeB;
}

function normalizeDateTextInput(value: string) {
  const raw = value.trim();
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw;
}

function toDatePickerValue(value: string) {
  const normalized = normalizeDateTextInput(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function formatDateInput(value: unknown) {
  if (value instanceof Date) {
    const offsetMs = value.getTimezoneOffset() * 60 * 1000;
    return new Date(value.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const raw = String(value ?? "").trim();
  if (!raw) return toTodayInputValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const idDateMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (idDateMatch) {
    const [, day, monthName, year] = idDateMatch;
    const monthMap: Record<string, string> = {
      jan: "01",
      januari: "01",
      feb: "02",
      februari: "02",
      mar: "03",
      maret: "03",
      apr: "04",
      april: "04",
      mei: "05",
      may: "05",
      jun: "06",
      juni: "06",
      jul: "07",
      juli: "07",
      agu: "08",
      ags: "08",
      agustus: "08",
      aug: "08",
      sep: "09",
      september: "09",
      okt: "10",
      oktober: "10",
      oct: "10",
      nov: "11",
      november: "11",
      des: "12",
      desember: "12",
      dec: "12",
    };
    const month = monthMap[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getCell(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([entryKey]) => entryKey.trim().toLowerCase() === key.toLowerCase());
    if (found) return found[1];
  }
  return "";
}

function normalizeBuyerEmail(value: unknown, options: { requireGmail?: boolean } = {}) {
  const emails = [
    ...new Set(
      String(value ?? "")
        .split(/[,;\n]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  if (options.requireGmail) {
    const invalidEmail = emails.find((email) => !/^[^\s@,;]+@gmail\.com$/i.test(email));
    if (invalidEmail) {
      throw new Error(`Email buyer harus berakhiran @gmail.com: ${invalidEmail}`);
    }
  }

  return emails.join(",");
}

function normalizeGoogleAccountEmail(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const [emailPart, ...metadataParts] = raw.split("|");
  const accountName = emailPart.trim().toLowerCase().replace(/@gmail\.com$/i, "");
  if (!/^[^\s@,;]+$/i.test(accountName)) {
    throw new Error(`Akun Google tidak perlu @gmail.com: ${accountName || raw}`);
  }
  const metadata = metadataParts.join("|").trim();
  return metadata ? `${accountName} | ${metadata}` : accountName;
}

function countBuyerEmails(value: unknown) {
  const normalized = normalizeBuyerEmail(value);
  if (!normalized) return 0;
  return normalized.split(",").filter(Boolean).length;
}

function parseImportAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function normalizeDuration(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return 30;
  if (raw.includes("3 bulan") || raw === "3bulan") return 90;
  if (raw.includes("2 bulan") || raw === "2bulan") return 60;
  if (raw.includes("1 bulan") || raw === "1bulan") return 30;

  const numeric = Math.floor(Number(raw.replace(/[^\d]/g, "")));
  return [30, 60, 90].includes(numeric) ? numeric : 30;
}

function inferDurationFromDates(startDate: string, expDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const exp = new Date(`${expDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(exp.getTime())) return 30;
  const days = Math.round((exp.getTime() - start.getTime()) / 86400000) + 1;
  if (days >= 80) return 90;
  if (days >= 50) return 60;
  return 30;
}

function normalizeActiveStatusImport(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["exp", "expired", "non aktif", "nonaktif"].includes(raw)) return "expired";
  return "aktif";
}

function normalizeMemberStatusImport(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "kick" ? "kick" : "anggota";
}

function normalizePlatformImport(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "whatsapp" || raw === "wa") return "whatsapp";
  return "shopee";
}

function formatDurationLabel(days: number) {
  if (days % 30 === 0) {
    return `${days / 30} Bulan`;
  }
  return `${days} Hari`;
}

function EditableDateField({
  label,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);

  return (
    <label className={compact ? "block space-y-1.5" : "block space-y-2"}>
      <span className={compact ? "text-xs font-semibold text-text-secondary" : "text-sm font-semibold text-text-secondary"}>{label}</span>
      <div className="relative">
        <input
          className={cn("pr-12", compact ? "rounded-[12px] px-3.5 py-2.5 text-sm" : "")}
          type="text"
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onChange(normalizeDateTextInput(event.target.value))}
          placeholder="YYYY-MM-DD"
        />
        <input
          ref={pickerRef}
          className="pointer-events-none absolute right-4 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={toDatePickerValue(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="absolute right-3 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-text-secondary transition hover:bg-[rgba(56,189,248,0.08)] hover:text-accent"
          type="button"
          disabled={disabled}
          aria-label={`Pilih tanggal ${label}`}
          title={`Pilih tanggal ${label}`}
          onClick={() => {
            const picker = pickerRef.current;
            if (picker && typeof picker.showPicker === "function") {
              picker.showPicker();
            } else {
              picker?.click();
            }
          }}
        >
          <CalendarDays size={18} />
        </button>
      </div>
    </label>
  );
}

export function TransactionsPage({ embedded = false }: { embedded?: boolean }) {
  const pageSize = 5;
  const appData = useAppData();
  const { showToast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const proofImageInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountModel[]>([]);
  const [pricePlans, setPricePlans] = useState<GeminiPricePlanModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expFilter, setExpFilter] = useState("all");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TransactionModel | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [proofImagePreview, setProofImagePreview] = useState<string | null>(null);
  const [successMessagePreview, setSuccessMessagePreview] = useState("");
  const [manualForm, setManualForm] = useState({
    googleAccountId: "",
    pricePlanId: "",
    platform: "shopee",
    noPesanan: "",
    phoneNumber: "",
    buyerEmail: "",
    activeDurationDays: "30",
    startDate: toTodayInputValue(),
  });
  const [editForm, setEditForm] = useState({
    googleAccountId: "",
    idTrx: "",
    buyerEmail: "",
    platform: "",
    reportStatus: "proses",
    activeStatus: "aktif",
    memberStatus: "anggota",
    activeStartAt: "",
    activeExpiresAt: "",
    warrantyExpiresAt: "",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [transactions, accounts, plans] = await Promise.all([
          appData.fetchTransactions(),
          appData.fetchGoogleAccounts(),
          appData.fetchGeminiPricePlans(),
        ]);
        if (mounted) {
          setItems(transactions);
          setGoogleAccounts(accounts);
          setPricePlans(plans);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Gagal memuat transaksi", "danger");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [appData.trxGeminiVersion]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasStatusFilter =
      expFilter !== "all" ||
      reportStatusFilter !== "all" ||
      activeStatusFilter !== "all" ||
      memberStatusFilter !== "all";
    const hasAnyFilter = q.length > 0 || hasStatusFilter;
    return items.filter((item) => {
      if (q) {
        const googleText = String(item.googleAccountEmail ?? "").toLowerCase();
        const buyerEmailText = String(item.buyerEmail ?? item.customerJid ?? "").toLowerCase();
        const buyerNameText = formatBuyerEmailDisplay(buyerEmailText).toLowerCase();
        const searchableText = `${item.idTrx} ${googleText} ${buyerEmailText} ${buyerNameText}`.toLowerCase();
        if (!searchableText.includes(q)) return false;
      }
      if (hasStatusFilter && String(item.platform ?? "").trim().toLowerCase() === "pribadi") return false;

      const activeStatus = getActiveStatus(item.activeExpiresAt, item.activeStatus, item.platform).toLowerCase();
      if (activeStatusFilter !== "all" && activeStatus !== activeStatusFilter) return false;

      if (memberStatusFilter !== "all" && item.memberStatus !== memberStatusFilter) return false;

      if (reportStatusFilter !== "all" && item.reportStatus !== reportStatusFilter) return false;

      if (expFilter !== "all") {
        const expEndTime = getLocalDayEndTime(item.activeExpiresAt);
        if (expEndTime === null) return false;

        const now = new Date();
        if (expFilter === "expired" && expEndTime >= now.getTime()) return false;

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const sevenDaysLater = new Date(todayStart);
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
        sevenDaysLater.setHours(23, 59, 59, 999);

        if (expFilter === "7" && (expEndTime < todayStart.getTime() || expEndTime > sevenDaysLater.getTime())) return false;
      }

      return true;
    }).sort((a, b) => compareTransactionStart(a, b, !hasAnyFilter));
  }, [activeStatusFilter, expFilter, items, memberStatusFilter, query, reportStatusFilter]);

  const totalPages = Math.max(Math.ceil(filteredItems.length / pageSize), 1);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [currentPage, filteredItems]);
  const activePricePlans = useMemo(
    () => pricePlans.filter((plan) => plan.isActive),
    [pricePlans],
  );
  const availableGoogleAccounts = useMemo(
    () => sortAvailableGoogleAccounts([...googleAccounts]),
    [googleAccounts],
  );
  const editableGoogleAccounts = useMemo(() => {
    const currentAccountId = editingItem?.googleAccountId ?? null;
    const currentAccountEmail = editingItem?.googleAccountEmail?.trim().toLowerCase() ?? "";
    return googleAccounts
      .filter((account) => {
        const isCurrentAccount =
          (currentAccountId !== null && account.id === currentAccountId) ||
          (currentAccountEmail && account.email.trim().toLowerCase() === currentAccountEmail);
        const hasAvailableSlot = !account.isSuspended && getGoogleAccountAvailableSlots(account) > 0;
        return isCurrentAccount || hasAvailableSlot;
      })
      .sort((a, b) => {
        const aCurrent =
          (currentAccountId !== null && a.id === currentAccountId) ||
          (currentAccountEmail && a.email.trim().toLowerCase() === currentAccountEmail);
        const bCurrent =
          (currentAccountId !== null && b.id === currentAccountId) ||
          (currentAccountEmail && b.email.trim().toLowerCase() === currentAccountEmail);
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
        const availableDiff = getGoogleAccountAvailableSlots(a) - getGoogleAccountAvailableSlots(b);
        if (availableDiff !== 0) return availableDiff;
        return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
      });
  }, [editingItem?.googleAccountEmail, editingItem?.googleAccountId, googleAccounts]);
  const defaultPricePlan = useMemo(
    () => getDefaultPricePlanForPlatform(activePricePlans, manualForm.platform),
    [activePricePlans, manualForm.platform],
  );
  const editControlClass = "w-full rounded-[12px] px-3.5 py-2.5 text-sm";

  useEffect(() => {
    setCurrentPage(1);
  }, [activeStatusFilter, expFilter, memberStatusFilter, query, reportStatusFilter, items.length]);

  useEffect(() => {
    if (!manualForm.pricePlanId && defaultPricePlan) {
      setManualForm((current) => ({
        ...current,
        pricePlanId: String(defaultPricePlan.id),
        activeDurationDays: String(defaultPricePlan.durationDays),
      }));
    }
  }, [defaultPricePlan, manualForm.pricePlanId]);

  useEffect(() => {
    return () => {
      if (proofImagePreview) URL.revokeObjectURL(proofImagePreview);
    };
  }, [proofImagePreview]);

  function handleProofImageFile(file: File | null) {
    setProofImageFile(file);
    setProofImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function validateProofImage(file: File) {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      showToast("Format gambar harus JPG, JPEG, atau PNG.", "danger");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("Ukuran gambar maksimal 10MB.", "danger");
      return false;
    }
    return true;
  }

  function handleProofPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file || !validateProofImage(file)) return;
    event.preventDefault();
    const extension = file.type === "image/png" ? "png" : "jpg";
    handleProofImageFile(new File([file], `bukti-transaksi.${extension}`, { type: file.type }));
  }

  function openEditModal(item: TransactionModel) {
    const matchedAccount = googleAccounts.find((account) => account.id === item.googleAccountId)
      ?? googleAccounts.find((account) => account.email === item.googleAccountEmail);
    setEditingItem(item);
    setEditForm({
      googleAccountId: matchedAccount ? String(matchedAccount.id) : "",
      idTrx: item.idTrx,
      buyerEmail: item.buyerEmail ?? formatCustomerJid(item.customerJid),
      platform: item.platform || "whatsapp",
      reportStatus: item.reportStatus,
      activeStatus: getActiveStatus(item.activeExpiresAt, item.activeStatus, item.platform).toLowerCase(),
      memberStatus: item.memberStatus,
      activeStartAt: toDateOnlyInputValue(item.activeStartAt),
      activeExpiresAt: toDateOnlyInputValue(item.activeExpiresAt),
      warrantyExpiresAt: toDateOnlyInputValue(item.warrantyExpiresAt),
    });
  }

  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualForm.googleAccountId) {
      showToast("Akun Google wajib dipilih.", "danger");
      return;
    }
    const selectedPlan = activePricePlans.find((plan) => String(plan.id) === manualForm.pricePlanId);
    if (!selectedPlan) {
      showToast("Paket harga wajib dipilih.", "danger");
      return;
    }
    if (manualForm.platform === "shopee" && !proofImageFile) {
      showToast("Gambar bukti wajib diisi.", "danger");
      return;
    }

    setIsSaving(true);
    try {
      const created = await appData.createManualTransaction({
        googleAccountId: Number(manualForm.googleAccountId),
        pricePlanId: selectedPlan.id,
        platform: manualForm.platform,
        noPesanan: manualForm.noPesanan,
        phoneNumber: manualForm.phoneNumber,
        buyerEmail: normalizeBuyerEmail(manualForm.buyerEmail, { requireGmail: true }),
        amount: selectedPlan.price * Math.max(1, countBuyerEmails(manualForm.buyerEmail)),
        activeDurationDays: selectedPlan.durationDays,
        startDate: manualForm.startDate,
        proofImage: manualForm.platform === "shopee" ? proofImageFile : null,
      });
      if (created.platform !== "whatsapp") {
        const settings = await appData.fetchSettings().catch(() => null);
        setSuccessMessagePreview(renderTransactionMessageTemplate(
          getTransactionMessageTemplateForPlatform(
            settings?.transactionMessageTemplate ?? DEFAULT_TRANSACTION_MESSAGE_TEMPLATE,
            created.platform,
          ),
          created,
          { saluran: settings?.testimonialChannelLink ?? "" },
        ));
      } else {
        setSuccessMessagePreview("");
      }
      const [nextItems, nextAccounts, nextPlans] = await Promise.all([
        appData.fetchTransactions(),
        appData.fetchGoogleAccounts(),
        appData.fetchGeminiPricePlans(),
      ]);
      setItems(nextItems);
      setGoogleAccounts(nextAccounts);
      setPricePlans(nextPlans);
      const shopeeDefaultPlan = getDefaultPricePlanForPlatform(
        nextPlans.filter((plan) => plan.isActive),
        "shopee",
      );
      setManualForm({
        googleAccountId: "",
        pricePlanId: shopeeDefaultPlan ? String(shopeeDefaultPlan.id) : "",
        platform: "shopee",
        noPesanan: "",
        phoneNumber: "",
        buyerEmail: "",
        activeDurationDays: shopeeDefaultPlan ? String(shopeeDefaultPlan.durationDays) : "30",
        startDate: toTodayInputValue(),
      });
      handleProofImageFile(null);
      if (proofImageInputRef.current) proofImageInputRef.current.value = "";
      setIsManualOpen(false);
      showToast("Transaksi manual berhasil disimpan.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan transaksi manual.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  function handleExportExcel() {
    const rows = filteredItems.map((item) => ({
      idTrx: item.idTrx,
      "Akun Google": item.googleAccountEmail ?? "",
      Platform: item.platform || "whatsapp",
      "Email Buyer": item.buyerEmail ?? formatCustomerJid(item.customerJid),
      Start: formatShortDate(item.activeStartAt),
      Exp: formatShortDate(item.activeExpiresAt),
      Laporan: item.reportStatus === "selesai" ? "Selesai" : "Proses",
      "Masa Aktif": getActiveStatus(item.activeExpiresAt, item.activeStatus, item.platform),
      "Status Akun": item.memberStatus === "kick" ? "kick" : "Anggota",
      Total: item.amount,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    XLSX.writeFile(workbook, `transaksi-${toTodayInputValue()}.xlsx`);
  }

  function handleImportExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPendingImportFile(file);
  }

  async function processImportExcel(file: File) {
    setIsSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (rows.length === 0) {
        showToast("File Excel kosong.", "danger");
        return;
      }

      const accountByEmail = new Map(
        googleAccounts.map((account) => [account.email.trim().toLowerCase(), account]),
      );
      const existingOrders = new Set(items.map((item) => item.idTrx.trim().toLowerCase()));
      const groupedRows = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const noPesanan = String(getCell(row, ["No Pesanan", "ID TRX", "ID Trx", "idTrx", "IDTRX", "No Order"])).trim();
        if (!noPesanan) continue;
        const orderKey = noPesanan.toLowerCase();
        const buyerEmail = normalizeBuyerEmail(getCell(row, ["Email", "Email Buyer", "Buyer Email"]), { requireGmail: true });
        const existingRow = groupedRows.get(orderKey);
        if (!existingRow) {
          groupedRows.set(orderKey, { ...row, __buyerEmails: buyerEmail });
          continue;
        }
        const mergedEmails = normalizeBuyerEmail(`${String(existingRow.__buyerEmails ?? "")},${buyerEmail}`, { requireGmail: true });
        existingRow.__buyerEmails = mergedEmails;
      }
      const seenOrders = new Set<string>();
      let imported = 0;
      let skipped = 0;
      let createdAccounts = 0;
      for (const row of groupedRows.values()) {
        const accountEmail = normalizeGoogleAccountEmail(getCell(row, ["Akun Google", "Google Account", "akun_google"]));
        if (!accountEmail) {
          throw new Error("Akun Google wajib diisi di file Excel.");
        }

        let account = accountByEmail.get(accountEmail.toLowerCase());
        if (!account) {
          account = await appData.createGoogleAccount({ email: accountEmail });
          accountByEmail.set(account.email.trim().toLowerCase(), account);
          createdAccounts += 1;
        }

        const noPesanan = String(getCell(row, ["No Pesanan", "ID TRX", "ID Trx", "idTrx", "IDTRX", "No Order"])).trim();
        const orderKey = noPesanan.toLowerCase();
        if (!noPesanan || seenOrders.has(orderKey) || existingOrders.has(orderKey)) {
          skipped += 1;
          continue;
        }
        seenOrders.add(orderKey);

        const buyerEmail = normalizeBuyerEmail(row.__buyerEmails ?? getCell(row, ["Email", "Email Buyer", "Buyer Email"]), { requireGmail: true });
        const buyerCount = Math.max(1, countBuyerEmails(buyerEmail));
        const platform = normalizePlatformImport(getCell(row, ["Platform"]));
        const startDate = formatDateInput(getCell(row, ["Start", "Tanggal Start", "Start Date"]));
        const activeExpiresAt = formatDateInput(getCell(row, ["Exp", "Expired", "Tanggal Exp", "Active Exp"]));
        const warrantyExpiresAt = formatDateInput(getCell(row, ["Garansi", "Warranty", "Tanggal Garansi"]));
        const durationCell = getCell(row, ["Durasi", "Active Days"]);
        const activeDurationDays = String(durationCell ?? "").trim()
          ? normalizeDuration(durationCell)
          : inferDurationFromDates(startDate, activeExpiresAt);
        const selectedPlan = activePricePlans.find((plan) => plan.durationDays === activeDurationDays);
        if (!selectedPlan) {
          throw new Error(`Paket harga aktif tidak ditemukan untuk durasi ${formatDurationLabel(activeDurationDays)}`);
        }
        const activeStatus = normalizeActiveStatusImport(getCell(row, ["Masa Aktif", "Status Masa Aktif", "Active Status"]));
        const memberStatus = normalizeMemberStatusImport(getCell(row, ["Status Akun", "Status Member", "Member Status"]));
        const importedAmount = parseImportAmount(getCell(row, ["Total", "Harga", "Amount", "Nominal"]));

        try {
          await appData.createManualTransaction({
            googleAccountId: account.id,
            pricePlanId: selectedPlan.id,
            platform,
            noPesanan,
            buyerEmail,
            amount: importedAmount ?? selectedPlan.price * buyerCount,
            activeDurationDays: selectedPlan.durationDays,
            startDate,
            activeStartAt: startDate,
            activeExpiresAt,
            warrantyExpiresAt,
            activeStatus,
            memberStatus,
          });
          existingOrders.add(orderKey);
          imported += 1;
        } catch (err) {
          if (err instanceof Error && err.message.toLowerCase().includes("no pesanan sudah ada")) {
            skipped += 1;
            continue;
          }
          throw err;
        }
      }

      const [nextItems, nextAccounts, nextPlans] = await Promise.all([
        appData.fetchTransactions(),
        appData.fetchGoogleAccounts(),
        appData.fetchGeminiPricePlans(),
      ]);
      setItems(nextItems);
      setGoogleAccounts(nextAccounts);
      setPricePlans(nextPlans);
      showToast(
        `${imported} transaksi berhasil diimport${createdAccounts ? `, ${createdAccounts} akun Google dibuat` : ""}${skipped ? `, ${skipped} duplikat dilewati` : ""}.`,
        "success",
      );
      setPendingImportFile(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal import Excel.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;

    setIsSaving(true);
    try {
      await appData.updateTransaction(editingItem.id, {
        googleAccountId: Number(editForm.googleAccountId),
        idTrx: editForm.idTrx,
        buyerEmail: normalizeBuyerEmail(editForm.buyerEmail, { requireGmail: true }),
        noBuyer: normalizeBuyerEmail(editForm.buyerEmail, { requireGmail: true }),
        platform: editForm.platform,
        reportStatus: editForm.reportStatus,
        activeStatus: editForm.activeStatus,
        memberStatus: editForm.memberStatus,
        amount: editingItem.amount,
        activeStartAt: normalizeDateTextInput(editForm.activeStartAt),
        activeExpiresAt: normalizeDateTextInput(editForm.activeExpiresAt),
        warrantyExpiresAt: normalizeDateTextInput(editForm.warrantyExpiresAt),
      });
      const nextItems = await appData.fetchTransactions();
      setItems(nextItems);
      setEditingItem(null);
      showToast("Transaksi berhasil diperbarui.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui transaksi.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: TransactionModel) {
    const confirmed = window.confirm(`Hapus transaksi ${item.idTrx}?`);
    if (!confirmed) return;
    try {
      const message = await appData.deleteTransaction(item.id);
      setItems((current) => current.filter((tx) => tx.id !== item.id));
      showToast(message, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus transaksi.", "danger");
    }
  }

  async function handleCopySuccessMessage() {
    const copied = await copyTextToClipboard(successMessagePreview);
    if (!copied) {
      showToast("Gagal menyalin template pesan.", "danger");
      return;
    }
    setSuccessMessagePreview("");
    showToast("Template pesan berhasil disalin.", "success");
  }

  async function handleCopyEditTemplate() {
    if (!editingItem) return;
    const previewTransaction: TransactionModel = {
      ...editingItem,
      idTrx: editForm.idTrx,
      buyerEmail: normalizeBuyerEmail(editForm.buyerEmail),
      customerJid: normalizeBuyerEmail(editForm.buyerEmail) || editingItem.customerJid,
      platform: editForm.platform,
      reportStatus: editForm.reportStatus === "selesai" ? "selesai" : "proses",
      activeStatus: editForm.activeStatus === "expired" ? "expired" : "aktif",
      memberStatus: editForm.memberStatus === "kick" ? "kick" : "anggota",
      activeStartAt: normalizeDateTextInput(editForm.activeStartAt) || editingItem.activeStartAt,
      activeExpiresAt: normalizeDateTextInput(editForm.activeExpiresAt) || editingItem.activeExpiresAt,
      warrantyExpiresAt: normalizeDateTextInput(editForm.warrantyExpiresAt) || editingItem.warrantyExpiresAt,
    };
    const settings = await appData.fetchSettings().catch(() => null);
    const text = renderTransactionMessageTemplate(
      getTransactionMessageTemplateForPlatform(
        settings?.transactionMessageTemplate ?? DEFAULT_TRANSACTION_MESSAGE_TEMPLATE,
        previewTransaction.platform,
      ),
      previewTransaction,
      { saluran: settings?.testimonialChannelLink ?? "" },
    );
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      showToast("Gagal menyalin template pesan.", "danger");
      return;
    }
    showToast("Template pesan berhasil disalin.", "success");
  }

  const headerActions = (
    <>
      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".xlsx,.xls"
        onChange={(event) => void handleImportExcel(event)}
      />
      <button
        className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-3 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
        type="button"
        disabled={isSaving}
        onClick={() => importInputRef.current?.click()}
      >
        <Upload size={18} /> Import Excel
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-3 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
        type="button"
        onClick={handleExportExcel}
      >
        <Download size={18} /> Export Excel
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-3 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
        type="button"
        onClick={() => {
          setQuery("");
          setExpFilter("all");
          setReportStatusFilter("all");
          setActiveStatusFilter("expired");
          setMemberStatusFilter("anggota");
        }}
      >
        <CalendarDays size={18} /> Cek Exp
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-[18px] bg-linear-to-r from-primary to-accent px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
        type="button"
        onClick={() => {
          if (defaultPricePlan) {
            setManualForm((current) => ({
              ...current,
              pricePlanId: String(defaultPricePlan.id),
              activeDurationDays: String(defaultPricePlan.durationDays),
            }));
          }
          setIsManualOpen(true);
        }}
      >
        <Plus size={18} /> Add Transaksi
      </button>
    </>
  );

  return (
    <div className="space-y-4">
      {embedded ? (
        <div className="flex flex-wrap justify-end gap-2">{headerActions}</div>
      ) : (
        <PageHeader title="Transaksi" actions={headerActions} />
      )}

      {loading ? null : (
        <SurfaceCard className="p-3 lg:p-4">
          <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_150px_150px_150px_150px_auto]">
            <label className="relative flex min-h-[48px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4">
              <Search size={18} className="pointer-events-none absolute left-5 text-text-secondary" />
              <input
                className="h-full w-full rounded-none border-0 bg-transparent py-0 pl-9 pr-3 text-sm text-white outline-none placeholder:text-text-muted focus:border-0"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari no pesanan / Google / Email"
              />
            </label>
            <label className="relative block">
              <select
                className="min-h-[48px] w-full appearance-none rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] py-0 pl-4 pr-11 text-sm text-white outline-none"
                value={expFilter}
                onChange={(event) => setExpFilter(event.target.value)}
                aria-label="Filter exp"
              >
                <option value="all">Exp</option>
                <option value="7">Exp: 7 hari</option>
                <option value="expired">Exp: Lewat</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
            </label>
            <label className="relative block">
              <select
                className="min-h-[48px] w-full appearance-none rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] py-0 pl-4 pr-11 text-sm text-white outline-none"
                value={reportStatusFilter}
                onChange={(event) => setReportStatusFilter(event.target.value)}
                aria-label="Filter laporan"
              >
                <option value="all">Laporan</option>
                <option value="proses">Proses</option>
                <option value="selesai">Selesai</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
            </label>
            <label className="relative block">
              <select
                className="min-h-[48px] w-full appearance-none rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] py-0 pl-4 pr-11 text-sm text-white outline-none"
                value={activeStatusFilter}
                onChange={(event) => setActiveStatusFilter(event.target.value)}
                aria-label="Filter masa aktif"
              >
                <option value="all">Masa Aktif</option>
                <option value="aktif">Aktif</option>
                <option value="expired">Expired</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
            </label>
            <label className="relative block">
              <select
                className="min-h-[48px] w-full appearance-none rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] py-0 pl-4 pr-11 text-sm text-white outline-none"
                value={memberStatusFilter}
                onChange={(event) => setMemberStatusFilter(event.target.value)}
                aria-label="Filter status akun"
              >
                <option value="all">Status</option>
                <option value="anggota">Anggota</option>
                <option value="kick">Kick</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
            </label>
            <button
              className="min-h-[48px] rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 text-sm font-bold text-text-secondary transition hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
              type="button"
              onClick={() => {
                setQuery("");
                setExpFilter("all");
                setReportStatusFilter("all");
                setActiveStatusFilter("all");
                setMemberStatusFilter("all");
              }}
            >
              Clear Filter
            </button>
          </div>
          <>
            <div className="overflow-x-hidden">
              <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[14%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="text-[12px] font-extrabold text-white">
                  <tr>
                    <th className="px-3 py-3">idTrx</th>
                    <th className="px-3 py-3">Google</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Platform</th>
                    <th className="px-3 py-3">Start</th>
                    <th className="px-3 py-3">Exp</th>
                    <th className="px-2 py-3 text-center">Laporan</th>
                    <th className="px-2 py-3 text-center">Masa Aktif</th>
                    <th className="px-2 py-3 text-center">Status</th>
                    <th className="px-2 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-8 text-center text-sm text-text-secondary">
                        Belum ada transaksi sukses.
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-8 text-center text-sm text-text-secondary">
                        idTrx tidak ditemukan.
                      </td>
                    </tr>
                  ) : pageItems.map((item) => {
                    const activeStatus = getActiveStatus(item.activeExpiresAt, item.activeStatus, item.platform);
                    const fullBuyerEmail = item.buyerEmail || item.googleAccountEmail || formatCustomerJid(item.customerJid);
                    const shortBuyerEmail = formatBuyerEmailDisplay(fullBuyerEmail) || fullBuyerEmail;
                    return (
                      <tr key={item.id} className="transition hover:bg-[rgba(56,189,248,0.06)]">
                        <td className="px-3 py-2.5 font-semibold leading-snug text-white">
                          <span className="block whitespace-nowrap text-xs xl:text-sm" title={item.idTrx}>{item.idTrx}</span>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">
                          <span className="block truncate" title={item.googleAccountEmail ?? "-"}>
                            {item.googleAccountEmail ?? "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">
                          <span
                            className="block truncate"
                            title={fullBuyerEmail}
                          >
                            {shortBuyerEmail}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">
                          <span className="block truncate" title={item.platform || "whatsapp"}>
                            {item.platform || "whatsapp"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">
                          <span className="block truncate" title={formatShortDate(item.activeStartAt)}>
                            {formatShortDate(item.activeStartAt)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">
                          <span className="block truncate" title={formatShortDate(item.activeExpiresAt)}>
                            {formatShortDate(item.activeExpiresAt)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={
                              item.reportStatus === "selesai"
                                ? "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(34,197,94,0.16)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-success"
                                : "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(250,204,21,0.14)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-yellow-300"
                            }
                          >
                            {item.reportStatus === "selesai" ? "SELESAI" : "PROSES"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={
                              activeStatus === "Aktif"
                                ? "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(34,197,94,0.16)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-success"
                                : "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(239,68,68,0.14)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-danger"
                            }
                          >
                            {activeStatus}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={
                              item.memberStatus === "kick"
                                ? "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(239,68,68,0.14)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-danger"
                                : "inline-flex min-w-[68px] justify-center rounded-[10px] bg-[rgba(56,189,248,0.14)] px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-accent"
                            }
                          >
                            {item.memberStatus === "kick" ? "KICK" : "ANGGOTA"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex justify-center gap-2">
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(56,189,248,0.22)] text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                          type="button"
                          onClick={() => openEditModal(item)}
                          aria-label="Edit transaksi"
                          title="Edit transaksi"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[rgba(244,63,94,0.24)] text-danger transition hover:bg-[rgba(244,63,94,0.08)]"
                          type="button"
                          onClick={() => void handleDelete(item)}
                          aria-label="Hapus transaksi"
                          title="Hapus transaksi"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
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
              </div>
            ) : null}
          </>
        </SurfaceCard>
      )}

      <Modal
        open={isManualOpen}
        title="Tambah Transaksi"
        onClose={() => setIsManualOpen(false)}
        wide
      >
        <form className="space-y-5" onSubmit={handleManualSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Akun Google</span>
              <div className="relative">
                <select
                  className="w-full appearance-none pr-11"
                  value={manualForm.googleAccountId}
                  onChange={(event) => setManualForm((current) => ({ ...current, googleAccountId: event.target.value }))}
                >
                  <option value="">Pilih akun Google</option>
                  {availableGoogleAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.email} - {getGoogleAccountAvailableSlots(account)}/{getGoogleAccountTotalSlots(account)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Platform</span>
              <div className="relative">
                <select
                  className="w-full appearance-none pr-11"
                  value={manualForm.platform}
                  onChange={(event) => {
                    const platform = event.target.value;
                    const nextDefaultPlan = getDefaultPricePlanForPlatform(activePricePlans, platform);
                    setManualForm((current) => ({
                      ...current,
                      platform,
                      noPesanan: platform === "whatsapp" ? "" : current.noPesanan,
                      phoneNumber: platform === "whatsapp" ? current.phoneNumber : "",
                      pricePlanId: nextDefaultPlan ? String(nextDefaultPlan.id) : "",
                      activeDurationDays: nextDefaultPlan ? String(nextDefaultPlan.durationDays) : current.activeDurationDays,
                    }));
                    if (platform === "whatsapp") {
                      handleProofImageFile(null);
                      if (proofImageInputRef.current) proofImageInputRef.current.value = "";
                    }
                  }}
                >
                  <option value="shopee">Shopee</option>
                  <option value="whatsapp">Whatsapp</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>

            {manualForm.platform === "whatsapp" ? null : (
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-text-secondary">idTrx</span>
                <input
                  value={manualForm.noPesanan}
                  onChange={(event) => setManualForm((current) => ({ ...current, noPesanan: event.target.value }))}
                  placeholder={manualForm.platform === "shopee" ? "ID pesanan Shopee" : "TRX manual"}
                />
              </label>
            )}

            {manualForm.platform === "whatsapp" ? (
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-text-secondary">Nomor WA</span>
                <input
                  value={manualForm.phoneNumber}
                  onChange={(event) => setManualForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                  placeholder="6281234567890"
                />
              </label>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Email</span>
              <input
                value={manualForm.buyerEmail}
                onChange={(event) => setManualForm((current) => ({ ...current, buyerEmail: event.target.value }))}
                placeholder="email1@gmail.com,email2@gmail.com"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Harga & Masa Aktif</span>
              <div className="relative">
                <select
                  className="w-full appearance-none pr-11"
                  value={manualForm.pricePlanId}
                  onChange={(event) => {
                    const selectedPlan = activePricePlans.find((plan) => String(plan.id) === event.target.value);
                    setManualForm((current) => ({
                      ...current,
                      pricePlanId: event.target.value,
                      activeDurationDays: selectedPlan ? String(selectedPlan.durationDays) : current.activeDurationDays,
                    }));
                  }}
                >
                  <option value="" disabled>Pilih harga</option>
                  {activePricePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.label} - Rp {formatCurrency(plan.price)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
              {activePricePlans.length === 0 ? (
                <span className="block text-xs text-danger">Belum ada harga aktif. Tambahkan di tab Harga.</span>
              ) : null}
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Start</span>
              <input
                type="date"
                value={manualForm.startDate}
                onChange={(event) => setManualForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
          </div>

          {manualForm.platform === "shopee" ? (
            <div
              className="rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.48)] p-4"
              onPaste={handleProofPaste}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-text-secondary">Gambar Bukti <span className="text-danger">*</span></span>
                <button
                  className="inline-flex items-center gap-2 rounded-[10px] border border-[rgba(56,189,248,0.22)] px-3 py-2 text-xs font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)]"
                  type="button"
                  onClick={() => proofImageInputRef.current?.click()}
                >
                  <Upload size={14} />
                  Pilih File
                </button>
              </div>
              {proofImagePreview ? (
                <div className="flex flex-wrap items-start gap-3">
                  <img
                    className="h-28 w-28 rounded-[10px] border border-[rgba(56,189,248,0.18)] object-cover"
                    src={proofImagePreview}
                    alt="Preview bukti transaksi"
                  />
                  <button
                    className="rounded-[10px] border border-[rgba(244,63,94,0.24)] px-3 py-2 text-xs font-bold text-danger transition hover:bg-[rgba(244,63,94,0.08)]"
                    type="button"
                    onClick={() => {
                      handleProofImageFile(null);
                      if (proofImageInputRef.current) proofImageInputRef.current.value = "";
                    }}
                  >
                    Hapus Gambar
                  </button>
                </div>
              ) : (
                <div className="rounded-[10px] border border-dashed border-[rgba(56,189,248,0.2)] px-4 py-5 text-sm text-text-secondary">
                  Gambar bukti wajib diisi. Pilih file atau tekan Ctrl + V saat area ini aktif.
                </div>
              )}
              <input
                ref={proofImageInputRef}
                className="hidden"
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) return;
                  if (!validateProofImage(file)) {
                    event.target.value = "";
                    return;
                  }
                  handleProofImageFile(file);
                }}
              />
            </div>
          ) : null}

          <button
            className="inline-flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Menyimpan..." : "Simpan Transaksi"}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingItem)}
        title="Edit Transaksi"
        onClose={() => setEditingItem(null)}
        wide
      >
        <form className="space-y-3" onSubmit={handleSaveEdit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">Akun Google</span>
              <div className="relative">
                <select
                  className={cn(editControlClass, "appearance-none pr-11")}
                  value={editForm.googleAccountId}
                  onChange={(event) => setEditForm((current) => ({ ...current, googleAccountId: event.target.value }))}
                >
                  <option value="">Pilih akun Google</option>
                  {editableGoogleAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.email} - {getGoogleAccountAvailableSlots(account)}/{getGoogleAccountTotalSlots(account)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">Platform</span>
              <div className="relative">
                <select
                  className={cn(editControlClass, "appearance-none pr-11")}
                  value={editForm.platform}
                  onChange={(event) => setEditForm((current) => ({ ...current, platform: event.target.value }))}
                >
                  <option value="shopee">shopee</option>
                  <option value="whatsapp">whatsapp</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">Laporan</span>
              <div className="relative">
                <select
                  className={cn(editControlClass, "appearance-none pr-11")}
                  value={editForm.reportStatus}
                  onChange={(event) => setEditForm((current) => ({ ...current, reportStatus: event.target.value }))}
                >
                  <option value="proses">PROSES</option>
                  <option value="selesai">SELESAI</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">No Pesanan</span>
              <input
                className={editControlClass}
                value={editForm.idTrx}
                onChange={(event) => setEditForm((current) => ({ ...current, idTrx: event.target.value }))}
                placeholder="2604xxxx"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">Email</span>
              <input
                className={editControlClass}
                value={editForm.buyerEmail}
                onChange={(event) => setEditForm((current) => ({ ...current, buyerEmail: event.target.value }))}
                placeholder="emailbuyer@gmail.com"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">Masa Aktif</span>
              <div className="relative">
                <select
                  className={cn(editControlClass, "appearance-none pr-11")}
                  value={editForm.activeStatus}
                  onChange={(event) => setEditForm((current) => ({ ...current, activeStatus: event.target.value }))}
                >
                  <option value="aktif">AKTIF</option>
                  <option value="expired">EXPIRED</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-secondary">Status</span>
              <div className="relative">
                <select
                  className={cn(editControlClass, "appearance-none pr-11")}
                  value={editForm.memberStatus}
                  onChange={(event) => setEditForm((current) => ({ ...current, memberStatus: event.target.value }))}
                >
                  <option value="anggota">ANGGOTA</option>
                  <option value="kick">KICK</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white" />
              </div>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <EditableDateField
              label="Start"
              value={editForm.activeStartAt}
              disabled
              compact
              onChange={(value) => setEditForm((current) => ({ ...current, activeStartAt: value }))}
            />

            <EditableDateField
              label="Exp"
              value={editForm.activeExpiresAt}
              disabled
              compact
              onChange={(value) => setEditForm((current) => ({ ...current, activeExpiresAt: value }))}
            />

            <EditableDateField
              label="Garansi"
              value={editForm.warrantyExpiresAt}
              disabled
              compact
              onChange={(value) => setEditForm((current) => ({ ...current, warrantyExpiresAt: value }))}
            />
          </div>

          <button
            className="inline-flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Menyimpan..." : "Update Transaksi"}
          </button>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[rgba(56,189,248,0.22)] px-4 py-2.5 text-sm font-bold text-accent transition hover:bg-[rgba(56,189,248,0.08)] disabled:opacity-60"
            type="button"
            disabled={isSaving}
            onClick={() => void handleCopyEditTemplate()}
          >
            <Copy size={16} />
            Copy Template
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(successMessagePreview)}
        title="Template Pesan"
        onClose={() => setSuccessMessagePreview("")}
        wide
      >
        <div className="space-y-5">
          <div className="whitespace-pre-wrap rounded-[18px] border border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.56)] px-5 py-5 text-base leading-8 text-text-primary">
            {successMessagePreview}
          </div>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            type="button"
            onClick={() => void handleCopySuccessMessage()}
          >
            <Copy size={16} />
            Copy
          </button>
        </div>
      </Modal>

      <ImportConfirmModal
        file={pendingImportFile}
        open={Boolean(pendingImportFile)}
        loading={isSaving}
        onCancel={() => setPendingImportFile(null)}
        onConfirm={() => {
          if (pendingImportFile) void processImportExcel(pendingImportFile);
        }}
      />
    </div>
  );
}
