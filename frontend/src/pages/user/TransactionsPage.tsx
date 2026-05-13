import { CalendarDays, Download, Edit2, Plus, Search, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImportConfirmModal } from "../../components/ImportConfirmModal";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SurfaceCard } from "../../components/SurfaceCard";
import { formatCurrency } from "../../lib/format";
import { useAppData } from "../../hooks/useAppData";
import { useToast } from "../../hooks/useToast";
import type { GeminiPricePlanModel, GoogleAccountModel, TransactionModel } from "../../types/models";

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

function getActiveStatus(
  value: string | null,
  manualStatus?: TransactionModel["activeStatus"],
  platform?: string,
) {
  const isPribadi = String(platform ?? "").trim().toLowerCase() === "pribadi";
  if (manualStatus === "aktif" && isPribadi) return "Aktif";
  if (manualStatus === "expired") return "Expired";
  if (!value) return "Aktif";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Aktif";
  return parsed.getTime() >= Date.now() ? "Aktif" : "Expired";
}

function getGoogleAccountTotalSlots(item: GoogleAccountModel) {
  return /\|\s*full\s+private\b/i.test(item.email) ? 1 : item.totalSlots;
}

function getGoogleAccountUsedSlots(item: GoogleAccountModel) {
  return Math.min(Math.max(item.usedSlots, 0), getGoogleAccountTotalSlots(item));
}

function isGoogleAccountAvailable(item: GoogleAccountModel) {
  return !item.isSuspended && getGoogleAccountUsedSlots(item) < getGoogleAccountTotalSlots(item);
}

function sortAvailableGoogleAccounts(items: GoogleAccountModel[]) {
  return items
    .filter(isGoogleAccountAvailable)
    .sort((a, b) => {
      const usedDiff = getGoogleAccountUsedSlots(b) - getGoogleAccountUsedSlots(a);
      if (usedDiff !== 0) return usedDiff;
      return a.email.localeCompare(b.email, "id", { sensitivity: "base", numeric: true });
    });
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

function normalizeBuyerEmail(value: unknown) {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[,;\n]+/)
        .map((item) => item.trim().replace(/@gmail\.com$/i, ""))
        .filter(Boolean),
    ),
  ].join(",");
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
  if (raw === "pribadi") return "pribadi";
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-text-secondary">{label}</span>
      <div className="relative">
        <input
          className="pr-12"
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
  const [items, setItems] = useState<TransactionModel[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountModel[]>([]);
  const [pricePlans, setPricePlans] = useState<GeminiPricePlanModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expFilter, setExpFilter] = useState("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TransactionModel | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [manualForm, setManualForm] = useState({
    googleAccountId: "",
    pricePlanId: "",
    platform: "shopee",
    noPesanan: "",
    buyerEmail: "",
    activeDurationDays: "30",
    startDate: toTodayInputValue(),
  });
  const [editForm, setEditForm] = useState({
    googleAccountId: "",
    idTrx: "",
    buyerEmail: "",
    platform: "",
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
      activeStatusFilter !== "all" ||
      memberStatusFilter !== "all";
    return items.filter((item) => {
      if (q && !item.idTrx.toLowerCase().includes(q)) return false;
      if (hasStatusFilter && String(item.platform ?? "").trim().toLowerCase() === "pribadi") return false;

      const activeStatus = getActiveStatus(item.activeExpiresAt, item.activeStatus, item.platform).toLowerCase();
      if (activeStatusFilter !== "all" && activeStatus !== activeStatusFilter) return false;

      if (memberStatusFilter !== "all" && item.memberStatus !== memberStatusFilter) return false;

      if (expFilter !== "all") {
        const expDate = item.activeExpiresAt ? new Date(item.activeExpiresAt) : null;
        if (!expDate || Number.isNaN(expDate.getTime())) return false;

        const now = new Date();
        if (expFilter === "expired" && expDate.getTime() >= now.getTime()) return false;

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const sevenDaysLater = new Date(todayStart);
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

        if (expFilter === "7" && (expDate < todayStart || expDate > sevenDaysLater)) return false;
      }

      return true;
    });
  }, [activeStatusFilter, expFilter, items, memberStatusFilter, query]);

  const totalPages = Math.max(Math.ceil(filteredItems.length / pageSize), 1);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [currentPage, filteredItems]);
  const pageStart = filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filteredItems.length);
  const activePricePlans = useMemo(
    () => pricePlans.filter((plan) => plan.isActive),
    [pricePlans],
  );
  const availableGoogleAccounts = useMemo(
    () => sortAvailableGoogleAccounts([...googleAccounts]),
    [googleAccounts],
  );
  const defaultPricePlan = useMemo(
    () => activePricePlans.find((plan) => plan.durationDays === 30) ?? activePricePlans[0] ?? null,
    [activePricePlans],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeStatusFilter, expFilter, memberStatusFilter, query, items.length]);

  useEffect(() => {
    if (!manualForm.pricePlanId && defaultPricePlan) {
      setManualForm((current) => ({
        ...current,
        pricePlanId: String(defaultPricePlan.id),
        activeDurationDays: String(defaultPricePlan.durationDays),
      }));
    }
  }, [defaultPricePlan, manualForm.pricePlanId]);

  function openEditModal(item: TransactionModel) {
    const matchedAccount = googleAccounts.find((account) => account.id === item.googleAccountId)
      ?? googleAccounts.find((account) => account.email === item.googleAccountEmail);
    setEditingItem(item);
    setEditForm({
      googleAccountId: matchedAccount ? String(matchedAccount.id) : "",
      idTrx: item.idTrx,
      buyerEmail: item.buyerEmail ?? formatCustomerJid(item.customerJid),
      platform: item.platform || "whatsapp",
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

    setIsSaving(true);
    try {
      await appData.createManualTransaction({
        googleAccountId: Number(manualForm.googleAccountId),
        pricePlanId: selectedPlan.id,
        platform: manualForm.platform,
        noPesanan: manualForm.noPesanan,
        buyerEmail: normalizeBuyerEmail(manualForm.buyerEmail),
        amount: selectedPlan.price * Math.max(1, countBuyerEmails(manualForm.buyerEmail)),
        activeDurationDays: selectedPlan.durationDays,
        startDate: manualForm.startDate,
      });
      const [nextItems, nextAccounts, nextPlans] = await Promise.all([
        appData.fetchTransactions(),
        appData.fetchGoogleAccounts(),
        appData.fetchGeminiPricePlans(),
      ]);
      setItems(nextItems);
      setGoogleAccounts(nextAccounts);
      setPricePlans(nextPlans);
      setManualForm({
        googleAccountId: "",
        pricePlanId: defaultPricePlan ? String(defaultPricePlan.id) : "",
        platform: "shopee",
        noPesanan: "",
        buyerEmail: "",
        activeDurationDays: defaultPricePlan ? String(defaultPricePlan.durationDays) : "30",
        startDate: toTodayInputValue(),
      });
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
      Bayar: formatDateTime(item.paidAt ?? item.createdAt),
      Start: formatShortDate(item.activeStartAt),
      Exp: formatShortDate(item.activeExpiresAt),
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
        const buyerEmail = normalizeBuyerEmail(getCell(row, ["Email", "Email Buyer", "Buyer Email"]));
        const existingRow = groupedRows.get(orderKey);
        if (!existingRow) {
          groupedRows.set(orderKey, { ...row, __buyerEmails: buyerEmail });
          continue;
        }
        const mergedEmails = normalizeBuyerEmail(`${String(existingRow.__buyerEmails ?? "")},${buyerEmail}`);
        existingRow.__buyerEmails = mergedEmails;
      }
      const seenOrders = new Set<string>();
      let imported = 0;
      let skipped = 0;
      for (const row of groupedRows.values()) {
        const accountEmail = String(getCell(row, ["Akun Google", "Google Account", "akun_google"])).trim();
        const account = accountByEmail.get(accountEmail.toLowerCase());
        if (!account) {
          throw new Error(`Akun Google tidak ditemukan: ${accountEmail}`);
        }

        const noPesanan = String(getCell(row, ["No Pesanan", "ID TRX", "ID Trx", "idTrx", "IDTRX", "No Order"])).trim();
        const orderKey = noPesanan.toLowerCase();
        if (!noPesanan || seenOrders.has(orderKey) || existingOrders.has(orderKey)) {
          skipped += 1;
          continue;
        }
        seenOrders.add(orderKey);

        const buyerEmail = normalizeBuyerEmail(row.__buyerEmails ?? getCell(row, ["Email", "Email Buyer", "Buyer Email"]));
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
        `${imported} transaksi berhasil diimport${skipped ? `, ${skipped} duplikat dilewati` : ""}.`,
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
        buyerEmail: normalizeBuyerEmail(editForm.buyerEmail),
        noBuyer: normalizeBuyerEmail(editForm.buyerEmail),
        platform: editForm.platform,
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
        <Plus size={18} /> Tambah Transaksi
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
          <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_160px_auto]">
            <label className="relative flex min-h-[48px] items-center rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4">
              <Search size={18} className="pointer-events-none absolute left-5 text-text-secondary" />
              <input
                className="h-full w-full rounded-none border-0 bg-transparent py-0 pl-9 pr-3 text-sm text-white outline-none placeholder:text-text-muted focus:border-0"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari idTrx"
              />
            </label>
            <select
              className="min-h-[48px] rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-0 text-sm text-white outline-none"
              value={expFilter}
              onChange={(event) => setExpFilter(event.target.value)}
              aria-label="Filter exp"
            >
              <option value="all">Exp</option>
              <option value="7">Exp: 7 hari</option>
              <option value="expired">Exp: Lewat</option>
            </select>
            <select
              className="min-h-[48px] rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-0 text-sm text-white outline-none"
              value={activeStatusFilter}
              onChange={(event) => setActiveStatusFilter(event.target.value)}
              aria-label="Filter masa aktif"
            >
              <option value="all">Masa Aktif</option>
              <option value="aktif">Aktif</option>
              <option value="expired">Expired</option>
            </select>
            <select
              className="min-h-[48px] rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 py-0 text-sm text-white outline-none"
              value={memberStatusFilter}
              onChange={(event) => setMemberStatusFilter(event.target.value)}
              aria-label="Filter status akun"
            >
              <option value="all">Status</option>
              <option value="anggota">Anggota</option>
              <option value="kick">Kick</option>
            </select>
            <button
              className="min-h-[48px] rounded-[14px] border border-[rgba(56,189,248,0.16)] bg-[rgba(15,23,42,0.72)] px-4 text-sm font-bold text-text-secondary transition hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
              type="button"
              onClick={() => {
                setQuery("");
                setExpFilter("all");
                setActiveStatusFilter("all");
                setMemberStatusFilter("all");
              }}
            >
              Clear Filter
            </button>
          </div>
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[8%]" />
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="text-[12px] font-extrabold text-white">
                  <tr>
                    <th className="px-3 py-3">idTrx</th>
                    <th className="px-3 py-3">Google</th>
                    <th className="px-3 py-3">Platform</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Start</th>
                    <th className="px-3 py-3">Exp</th>
                    <th className="px-2 py-3 text-center">Masa Aktif</th>
                    <th className="px-2 py-3 text-center">Status</th>
                    <th className="px-2 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(56,189,248,0.1)]">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-sm text-text-secondary">
                        Belum ada transaksi sukses.
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-sm text-text-secondary">
                        idTrx tidak ditemukan.
                      </td>
                    </tr>
                  ) : pageItems.map((item) => {
                    const activeStatus = getActiveStatus(item.activeExpiresAt, item.activeStatus, item.platform);
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
                          <span className="block truncate" title={item.platform || "whatsapp"}>
                            {item.platform || "whatsapp"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">
                          <span
                            className="block truncate"
                            title={item.buyerEmail || item.googleAccountEmail || formatCustomerJid(item.customerJid)}
                          >
                            {item.buyerEmail || item.googleAccountEmail || formatCustomerJid(item.customerJid)}
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
              <span>
                Menampilkan {pageStart} - {pageEnd} dari {filteredItems.length} data
              </span>
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
              <select
                value={manualForm.googleAccountId}
                onChange={(event) => setManualForm((current) => ({ ...current, googleAccountId: event.target.value }))}
              >
                <option value="">Pilih akun Google</option>
                {availableGoogleAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} - {getGoogleAccountUsedSlots(account)}/{getGoogleAccountTotalSlots(account)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Platform</span>
              <select
                value={manualForm.platform}
                onChange={(event) => setManualForm((current) => ({ ...current, platform: event.target.value }))}
              >
                <option value="shopee">Shopee</option>
                <option value="whatsapp">Whatsapp</option>
                <option value="pribadi">Pribadi</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">idTrx</span>
              <input
                value={manualForm.noPesanan}
                onChange={(event) => setManualForm((current) => ({ ...current, noPesanan: event.target.value }))}
                placeholder="2604xxxx"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Email</span>
              <input
                value={manualForm.buyerEmail}
                onChange={(event) => setManualForm((current) => ({ ...current, buyerEmail: event.target.value.replace(/@gmail\.com/gi, "") }))}
                placeholder="email1,email2,email3"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Harga & Masa Aktif</span>
              <select
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
                    {plan.label} - {formatDurationLabel(plan.durationDays)} - Rp {formatCurrency(plan.price)}
                  </option>
                ))}
              </select>
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

          <button
            className="inline-flex w-full items-center justify-center rounded-[14px] bg-[rgba(15,23,42,0.96)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
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
        <form className="space-y-4" onSubmit={handleSaveEdit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Akun Google</span>
              <select
                value={editForm.googleAccountId}
                onChange={(event) => setEditForm((current) => ({ ...current, googleAccountId: event.target.value }))}
              >
                <option value="">Pilih akun Google</option>
                {googleAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} - {getGoogleAccountUsedSlots(account)}/{getGoogleAccountTotalSlots(account)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Platform</span>
              <select
                value={editForm.platform}
                onChange={(event) => setEditForm((current) => ({ ...current, platform: event.target.value }))}
              >
                <option value="shopee">shopee</option>
                <option value="whatsapp">whatsapp</option>
                <option value="pribadi">pribadi</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">No Pesanan</span>
              <input
                value={editForm.idTrx}
                onChange={(event) => setEditForm((current) => ({ ...current, idTrx: event.target.value }))}
                placeholder="2604xxxx"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Email</span>
              <input
                value={editForm.buyerEmail}
                onChange={(event) => setEditForm((current) => ({ ...current, buyerEmail: event.target.value.replace(/@gmail\.com/gi, "") }))}
                placeholder="email buyer"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Masa Aktif</span>
              <select
                value={editForm.activeStatus}
                onChange={(event) => setEditForm((current) => ({ ...current, activeStatus: event.target.value }))}
              >
                <option value="aktif">AKTIF</option>
                <option value="expired">EXPIRED</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-text-secondary">Status</span>
              <select
                value={editForm.memberStatus}
                onChange={(event) => setEditForm((current) => ({ ...current, memberStatus: event.target.value }))}
              >
                <option value="anggota">ANGGOTA</option>
                <option value="kick">KICK</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <EditableDateField
              label="Start"
              value={editForm.activeStartAt}
              disabled
              onChange={(value) => setEditForm((current) => ({ ...current, activeStartAt: value }))}
            />

            <EditableDateField
              label="Exp"
              value={editForm.activeExpiresAt}
              disabled
              onChange={(value) => setEditForm((current) => ({ ...current, activeExpiresAt: value }))}
            />

            <EditableDateField
              label="Garansi"
              value={editForm.warrantyExpiresAt}
              disabled
              onChange={(value) => setEditForm((current) => ({ ...current, warrantyExpiresAt: value }))}
            />
          </div>

          <button
            className="inline-flex w-full items-center justify-center rounded-[18px] bg-[rgba(15,23,42,0.96)] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Menyimpan..." : "Update Transaksi"}
          </button>
        </form>
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
