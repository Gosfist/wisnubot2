import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRef } from "react";
import type {
  AdminStatsModel,
  AppSettingsModel,
  ActivityLogModel,
  BotModel,
  BroadcastModel,
  CsButtonModel,
  CsButtonType,
  CsDeliveryMode,
  CsStockModel,
  CsStockSummaryModel,
  GeminiPricePlanModel,
  GoogleAccountModel,
  CustomerServiceItemModel,
  GroupModel,
  GroupPushExclusionModel,
  GroupPushMemberModel,
  PushContactRunModel,
  PushContactTemplateModel,
  TransactionModel,
  UserModel,
} from "../types/models";
import { apiFetch, withJsonBody } from "../lib/http";
import { socketService } from "../lib/socket";
import { useAuth } from "./AuthProvider";

interface AppDataContextValue {
  user: UserModel | null;
  bots: BotModel[];
  groups: GroupModel[];
  broadcasts: BroadcastModel[];
  customerServiceItems: CustomerServiceItemModel[];
  trxGeminiVersion: number;
  preloadForSession: (seedUser?: UserModel) => Promise<void>;
  refreshUser: () => Promise<UserModel>;
  refreshBots: () => Promise<BotModel[]>;
  refreshGroups: () => Promise<GroupModel[]>;
  refreshBroadcasts: () => Promise<BroadcastModel[]>;
  refreshCustomerService: () => Promise<CustomerServiceItemModel[]>;
  clear: () => void;
  getAdminStats: () => Promise<AdminStatsModel>;
  fetchActivityLogs: () => Promise<ActivityLogModel[]>;
  testBroadcastBot: () => Promise<string>;
  testUserBot: () => Promise<string>;
  createBroadcast: (data: Record<string, unknown>) => Promise<void>;
  updateBroadcast: (id: number, data: Record<string, unknown>) => Promise<void>;
  deleteBroadcast: (id: number) => Promise<string>;
  createCustomerService: (data: Record<string, unknown>) => Promise<CustomerServiceItemModel>;
  updateCustomerService: (id: number, data: Record<string, unknown>) => Promise<void>;
  deleteCustomerService: (id: number) => Promise<string>;
  saveCsButtons: (csId: number, buttons: CsButtonModel[]) => Promise<CsButtonModel[]>;
  fetchStocksSummary: () => Promise<CsStockSummaryModel[]>;
  fetchStocksForCs: (csId: number) => Promise<CsStockModel[]>;
  addStocks: (csId: number, contents: string | string[]) => Promise<{ added: number; message: string }>;
  deleteStock: (stockId: number) => Promise<string>;
  clearStocks: (csId: number) => Promise<string>;
  fetchGoogleAccounts: () => Promise<GoogleAccountModel[]>;
  createGoogleAccount: (payload: { email: string }) => Promise<GoogleAccountModel>;
  setGoogleAccountSuspended: (accountId: number, suspended: boolean) => Promise<GoogleAccountModel>;
  deleteGoogleAccount: (accountId: number) => Promise<string>;
  fetchGeminiPricePlans: () => Promise<GeminiPricePlanModel[]>;
  createGeminiPricePlan: (payload: Record<string, unknown>) => Promise<GeminiPricePlanModel>;
  updateGeminiPricePlan: (priceId: number, payload: Record<string, unknown>) => Promise<GeminiPricePlanModel>;
  deleteGeminiPricePlan: (priceId: number) => Promise<string>;
  fetchPushTemplates: () => Promise<PushContactTemplateModel[]>;
  createPushTemplate: (payload: { title: string; messageText: string }) => Promise<PushContactTemplateModel>;
  updatePushTemplate: (templateId: number, payload: { title: string; messageText: string }) => Promise<PushContactTemplateModel>;
  deletePushTemplate: (templateId: number) => Promise<string>;
  fetchPushStatus: () => Promise<{ isRunning: boolean; running: PushContactRunModel | null }>;
  startPushContact: (payload: { templateId: number; groupId: number; botId?: number }) => Promise<{ message: string; totalTargets: number; isRunning: boolean; running: PushContactRunModel | null }>;
  fetchGroupPushMembers: (groupId: string) => Promise<GroupPushMemberModel[]>;
  fetchGroupPushExclusions: (groupId: string) => Promise<GroupPushExclusionModel[]>;
  addGroupPushExclusion: (groupId: string, payload: { phoneNumber: string; label?: string }) => Promise<GroupPushExclusionModel>;
  deleteGroupPushExclusion: (groupId: string, exclusionId: number) => Promise<string>;
  fetchTransactions: () => Promise<TransactionModel[]>;
  refreshTrxGeminiData: () => Promise<{
    googleAccounts: GoogleAccountModel[];
    geminiPricePlans: GeminiPricePlanModel[];
    transactions: TransactionModel[];
  }>;
  createManualTransaction: (payload: Record<string, unknown>) => Promise<TransactionModel>;
  updateTransaction: (transactionId: number, payload: Record<string, unknown>) => Promise<TransactionModel>;
  updateTransactionReport: (transactionId: number, payload: { reportStatus: "proses" | "selesai" }) => Promise<TransactionModel>;
  deleteTransaction: (transactionId: number) => Promise<string>;
  fetchSettings: () => Promise<AppSettingsModel>;
  updateSettings: (payload: Partial<AppSettingsModel>) => Promise<AppSettingsModel>;
  connectBot: (data?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refreshQr: (target: { botId?: number; sessionName?: string }, data?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  cancelPendingBot: (sessionName: string) => Promise<void>;
  disconnectBot: (botId: number) => Promise<string>;
  joinGroup: (inviteLink: string, botId?: number) => Promise<GroupModel>;
  toggleGroup: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<string>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function parseUser(payload: Record<string, unknown>): UserModel {
  return {
    id: Number(payload.id ?? 0),
    username: String(payload.username ?? "admin"),
    createdAt: String(payload.created_at ?? ""),
  };
}

function parseBot(payload: Record<string, unknown>): BotModel {
  const purpose = String(payload.bot_purpose ?? payload.purpose ?? "main") === "push_contact" ? "push_contact" : "main";
  return {
    id: Number(payload.id ?? 0),
    phoneNumber: String(payload.phone_number ?? "-"),
    purpose,
    status: String(payload.status ?? "offline"),
    expiredAt: payload.expired_at ? String(payload.expired_at) : null,
    groupCount: Number(payload.group_count ?? 0),
    activeBroadcastCount: Number(payload.active_broadcast_count ?? 0),
  };
}

function parseGroup(payload: Record<string, unknown>): GroupModel {
  const botPurpose = String(payload.bot_purpose ?? payload.botPurpose ?? "main") === "push_contact" ? "push_contact" : "main";
  return {
    id: String(payload.id ?? ""),
    botId: Number(payload.bot_id ?? payload.botId ?? 0),
    botPhoneNumber: String(payload.bot_phone_number ?? payload.botPhoneNumber ?? ""),
    botPurpose,
    name: String(payload.name ?? ""),
    memberCount: Number(payload.member_count ?? 0),
    isActive: Boolean(payload.is_active ?? true),
  };
}

function parseActivityLog(payload: Record<string, unknown>): ActivityLogModel {
  return {
    id: Number(payload.id ?? 0),
    action: String(payload.action ?? ""),
    detail: String(payload.detail ?? ""),
    createdAt: payload.createdAt ?? payload.created_at ? String(payload.createdAt ?? payload.created_at) : null,
  };
}

function parsePushTemplate(payload: Record<string, unknown>): PushContactTemplateModel {
  return {
    id: Number(payload.id ?? 0),
    title: String(payload.title ?? ""),
    messageText: String(payload.messageText ?? payload.message_text ?? ""),
    createdAt: payload.createdAt ?? payload.created_at ? String(payload.createdAt ?? payload.created_at) : null,
    updatedAt: payload.updatedAt ?? payload.updated_at ? String(payload.updatedAt ?? payload.updated_at) : null,
  };
}

function parsePushRun(payload: Record<string, unknown>): PushContactRunModel {
  return {
    id: Number(payload.id ?? 0),
    status: String(payload.status ?? ""),
    totalTargets: Number(payload.totalTargets ?? payload.total_targets ?? 0),
    successCount: Number(payload.successCount ?? payload.success_count ?? 0),
    failedCount: Number(payload.failedCount ?? payload.failed_count ?? 0),
    startedAt: payload.startedAt ?? payload.started_at ? String(payload.startedAt ?? payload.started_at) : null,
    finishedAt: payload.finishedAt ?? payload.finished_at ? String(payload.finishedAt ?? payload.finished_at) : null,
  };
}

function parseGroupPushExclusion(payload: Record<string, unknown>): GroupPushExclusionModel {
  return {
    id: Number(payload.id ?? 0),
    groupId: Number(payload.groupId ?? payload.group_id ?? 0),
    phoneNumber: String(payload.phoneNumber ?? payload.phone_number ?? ""),
    label: payload.label ? String(payload.label) : null,
    createdAt: payload.createdAt ?? payload.created_at ? String(payload.createdAt ?? payload.created_at) : null,
  };
}

function parseGroupPushMember(payload: Record<string, unknown>): GroupPushMemberModel {
  const rawPhoneNumber = String(payload.phoneNumber ?? payload.phone_number ?? "").replace(/\D/g, "");
  const phoneNumber = /^62\d{8,15}$/.test(rawPhoneNumber) ? rawPhoneNumber : "";
  return {
    jid: String(payload.jid ?? ""),
    phoneNumber,
    displayName: String(payload.displayName ?? payload.display_name ?? phoneNumber ?? ""),
    isAdmin: Boolean(payload.isAdmin ?? payload.is_admin ?? false),
    isBot: Boolean(payload.isBot ?? payload.is_bot ?? false),
    isExcluded: Boolean(payload.isExcluded ?? payload.is_excluded ?? false),
    exclusionId: payload.exclusionId ?? payload.exclusion_id ? Number(payload.exclusionId ?? payload.exclusion_id) : null,
    exclusionLabel: payload.exclusionLabel ?? payload.exclusion_label ? String(payload.exclusionLabel ?? payload.exclusion_label) : null,
  };
}

function parseJsonArrayString(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const VALID_DAY_KEYS = new Set([
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
  "minggu",
]);

function normalizeDayKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f']/g, "");
}

function parseScheduleEntries(
  scheduleTimeRaw: unknown,
  scheduleDaysRaw: unknown,
): { time: string; days: string[] }[] {
  const rawList = parseJsonArrayString(scheduleTimeRaw);
  const fallbackDays = parseJsonArrayString(scheduleDaysRaw)
    .map(normalizeDayKey)
    .filter((d) => VALID_DAY_KEYS.has(d));

  const entries: { time: string; days: string[] }[] = [];
  for (const item of rawList) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const time = obj.time ?? obj.t;
      if (typeof time !== "string" || !/^\d{1,2}:\d{2}$/.test(time.trim())) continue;
      const daysSource = Array.isArray(obj.days) ? obj.days : fallbackDays;
      const days = [
        ...new Set(
          daysSource.map(normalizeDayKey).filter((d) => VALID_DAY_KEYS.has(d)),
        ),
      ];
      if (!days.length) continue;
      const [h, m] = time.trim().split(":");
      const normalized = `${String(parseInt(h, 10)).padStart(2, "0")}:${String(parseInt(m, 10)).padStart(2, "0")}`;
      entries.push({ time: normalized, days });
    } else if (typeof item === "string" && /^\d{1,2}:\d{2}$/.test(item.trim())) {
      if (!fallbackDays.length) continue;
      const [h, m] = item.trim().split(":");
      const normalized = `${String(parseInt(h, 10)).padStart(2, "0")}:${String(parseInt(m, 10)).padStart(2, "0")}`;
      entries.push({ time: normalized, days: [...fallbackDays] });
    }
  }
  return entries;
}

function parseBroadcast(payload: Record<string, unknown>): BroadcastModel {
  return {
    id: Number(payload.id ?? 0),
    title: String(payload.title ?? ""),
    messageText: String(payload.message_text ?? ""),
    imageUrl: payload.image_url ? String(payload.image_url) : null,
    isActive: Boolean(payload.is_active ?? true),
    schedules: parseScheduleEntries(payload.schedule_time, payload.schedule_days),
    targetGroupIds: parseJsonArrayString(payload.target_group_ids).map(Number),
    targetExcludedGroupIds: parseJsonArrayString(payload.target_excluded_group_ids).map(Number),
    targetBotIds: parseJsonArrayString(payload.target_bot_ids).map(Number),
    createdAt: String(payload.created_at ?? ""),
  };
}

function parseCsButton(payload: Record<string, unknown>): CsButtonModel {
  return {
    id: payload.id !== undefined ? Number(payload.id) : undefined,
    label: String(payload.label ?? ""),
    buttonType: String(payload.buttonType ?? payload.button_type ?? "link") as CsButtonType,
    targetCommand: payload.targetCommand ?? payload.target_command ? String(payload.targetCommand ?? payload.target_command) : null,
    targetUrl: payload.targetUrl ?? payload.target_url ? String(payload.targetUrl ?? payload.target_url) : null,
    replyText: payload.replyText ?? payload.reply_text ? String(payload.replyText ?? payload.reply_text) : null,
    price: payload.price === null || payload.price === undefined ? null : Number(payload.price),
    activeDurationDays: payload.activeDurationDays ?? payload.active_duration_days ? Number(payload.activeDurationDays ?? payload.active_duration_days) : null,
    warrantyDurationDays: payload.warrantyDurationDays ?? payload.warranty_duration_days ? Number(payload.warrantyDurationDays ?? payload.warranty_duration_days) : null,
    orderIndex: Number(payload.orderIndex ?? payload.order_index ?? 0),
  };
}

function parseCustomerService(payload: Record<string, unknown>): CustomerServiceItemModel {
  const buttonsRaw = Array.isArray(payload.buttons) ? (payload.buttons as Record<string, unknown>[]) : [];
  return {
    id: Number(payload.id ?? 0),
    commandName: String(payload.nama_perintah ?? payload.command_name ?? ""),
    value: String(payload.value ?? ""),
    deliveryMode: (String(payload.delivery_mode ?? "none") as CsDeliveryMode),
    price: payload.price === null || payload.price === undefined ? null : Number(payload.price),
    relayPrompt: payload.relay_prompt ? String(payload.relay_prompt) : null,
    relayWaitingText: payload.relay_waiting_text ? String(payload.relay_waiting_text) : null,
    relayOwnerInstruction: payload.relay_owner_instruction ? String(payload.relay_owner_instruction) : null,
    relayDoneText: payload.relay_done_text ? String(payload.relay_done_text) : null,
    buttons: buttonsRaw.map(parseCsButton),
    createdAt: String(payload.created_at ?? ""),
    updatedAt: String(payload.updated_at ?? ""),
  };
}

function parseStock(payload: Record<string, unknown>): CsStockModel {
  return {
    id: Number(payload.id ?? 0),
    csId: Number(payload.csId ?? payload.cs_id ?? 0),
    content: String(payload.content ?? ""),
    isUsed: Boolean(payload.isUsed ?? payload.is_used ?? false),
    usedByJid: payload.usedByJid ?? payload.used_by_jid ? String(payload.usedByJid ?? payload.used_by_jid) : null,
    usedAt: payload.usedAt ?? payload.used_at ? String(payload.usedAt ?? payload.used_at) : null,
    createdAt: String(payload.createdAt ?? payload.created_at ?? ""),
  };
}

function parseStockSummary(payload: Record<string, unknown>): CsStockSummaryModel {
  return {
    csId: Number(payload.csId ?? 0),
    commandName: String(payload.namaPerintah ?? ""),
    deliveryMode: (String(payload.deliveryMode ?? "none") as CsDeliveryMode),
    price: payload.price === null || payload.price === undefined ? null : Number(payload.price),
    total: Number(payload.total ?? 0),
    available: Number(payload.available ?? 0),
    used: Number(payload.used ?? 0),
  };
}

function parseGoogleAccount(payload: Record<string, unknown>): GoogleAccountModel {
  const email = String(payload.email ?? "");
  const isFullPrivate = /\|\s*full\s+private\b/i.test(email);
  return {
    id: Number(payload.id ?? 0),
    email,
    totalSlots: isFullPrivate ? 1 : Number(payload.totalSlots ?? payload.total_slots ?? 5),
    usedSlots: Number(payload.usedSlots ?? payload.used_slots ?? 0),
    isSuspended: Boolean(payload.isSuspended ?? payload.is_suspended ?? false),
    createdAt: payload.createdAt ?? payload.created_at ? String(payload.createdAt ?? payload.created_at) : null,
  };
}

function parseGeminiPricePlan(payload: Record<string, unknown>): GeminiPricePlanModel {
  return {
    id: Number(payload.id ?? 0),
    label: String(payload.label ?? ""),
    durationDays: Number(payload.durationDays ?? payload.duration_days ?? 0),
    price: Number(payload.price ?? 0),
    isActive: Boolean(payload.isActive ?? payload.is_active ?? false),
    createdAt: payload.createdAt ?? payload.created_at ? String(payload.createdAt ?? payload.created_at) : null,
    updatedAt: payload.updatedAt ?? payload.updated_at ? String(payload.updatedAt ?? payload.updated_at) : null,
  };
}

function parseTransaction(payload: Record<string, unknown>): TransactionModel {
  return {
    id: Number(payload.id ?? 0),
    idTrx: String(payload.idTrx ?? payload.id_trx ?? ""),
    googleAccountId: payload.googleAccountId ?? payload.google_account_id ? Number(payload.googleAccountId ?? payload.google_account_id) : null,
    geminiPricePlanId: payload.geminiPricePlanId ?? payload.gemini_price_plan_id ? Number(payload.geminiPricePlanId ?? payload.gemini_price_plan_id) : null,
    customerJid: String(payload.customerJid ?? payload.customer_jid ?? ""),
    amount: Number(payload.amount ?? 0),
    buyerCount: Math.max(1, Number(payload.buyerCount ?? payload.buyer_count ?? 1)),
    status: String(payload.status ?? ""),
    orderStatus: payload.orderStatus ?? payload.order_status ? String(payload.orderStatus ?? payload.order_status) : null,
    commandName: payload.commandName ?? payload.command_name ? String(payload.commandName ?? payload.command_name) : null,
    googleAccountEmail: payload.googleAccountEmail ?? payload.google_account_email ? String(payload.googleAccountEmail ?? payload.google_account_email) : null,
    buyerEmail: payload.buyerEmail ?? payload.buyer_email ? String(payload.buyerEmail ?? payload.buyer_email) : null,
    stockContent: payload.stockContent ?? payload.stock_content ? String(payload.stockContent ?? payload.stock_content) : null,
    platform: String(payload.platform ?? "whatsapp"),
    activeStatus: payload.activeStatus ?? payload.active_status
      ? (String(payload.activeStatus ?? payload.active_status).toLowerCase() === "expired" ? "expired" : "aktif")
      : null,
    memberStatus: String(payload.memberStatus ?? payload.member_status ?? "anggota").toLowerCase() === "kick" ? "kick" : "anggota",
    reportStatus: String(payload.reportStatus ?? payload.report_status ?? "proses").toLowerCase() === "selesai" ? "selesai" : "proses",
    proofDriveFileId: payload.proofDriveFileId ?? payload.proof_drive_file_id ? String(payload.proofDriveFileId ?? payload.proof_drive_file_id) : null,
    proofDriveUrl: payload.proofDriveUrl ?? payload.proof_drive_url ? String(payload.proofDriveUrl ?? payload.proof_drive_url) : null,
    proofUploadedAt: payload.proofUploadedAt ?? payload.proof_uploaded_at ? String(payload.proofUploadedAt ?? payload.proof_uploaded_at) : null,
    isManual: Boolean(payload.isManual ?? payload.is_manual ?? false),
    activeDurationDays: payload.activeDurationDays ?? payload.active_duration_days ? Number(payload.activeDurationDays ?? payload.active_duration_days) : null,
    warrantyDurationDays: payload.warrantyDurationDays ?? payload.warranty_duration_days ? Number(payload.warrantyDurationDays ?? payload.warranty_duration_days) : null,
    completedAt: payload.completedAt ?? payload.completed_at ? String(payload.completedAt ?? payload.completed_at) : null,
    activeStartAt: payload.activeStartAt ?? payload.active_start_at ? String(payload.activeStartAt ?? payload.active_start_at) : null,
    activeExpiresAt: payload.activeExpiresAt ?? payload.active_expires_at ? String(payload.activeExpiresAt ?? payload.active_expires_at) : null,
    warrantyStartAt: payload.warrantyStartAt ?? payload.warranty_start_at ? String(payload.warrantyStartAt ?? payload.warranty_start_at) : null,
    warrantyExpiresAt: payload.warrantyExpiresAt ?? payload.warranty_expires_at ? String(payload.warrantyExpiresAt ?? payload.warranty_expires_at) : null,
    paidAt: payload.paidAt ?? payload.paid_at ? String(payload.paidAt ?? payload.paid_at) : null,
    deliveredAt: payload.deliveredAt ?? payload.delivered_at ? String(payload.deliveredAt ?? payload.delivered_at) : null,
    createdAt: payload.createdAt ?? payload.created_at ? String(payload.createdAt ?? payload.created_at) : null,
  };
}

function parseAppSettings(payload: Record<string, unknown>): AppSettingsModel {
  const statusRaw = payload.testimonialChannelStatus ?? payload.testimonial_channel_status;
  const status = statusRaw && typeof statusRaw === "object"
    ? statusRaw as Record<string, unknown>
    : null;
  return {
    pakasirSlug: String(payload.pakasirSlug ?? ""),
    pakasirApiKey: String(payload.pakasirApiKey ?? ""),
    pakasirApiKeyMasked: payload.pakasirApiKeyMasked ? String(payload.pakasirApiKeyMasked) : null,
    hasApiKey: Boolean(payload.hasApiKey ?? false),
    testimonialChannelLink: String(payload.testimonialChannelLink ?? payload.testimonial_channel_link ?? ""),
    testimonialChannelJid: String(payload.testimonialChannelJid ?? payload.testimonial_channel_jid ?? ""),
    testimonialChannelName: String(payload.testimonialChannelName ?? payload.testimonial_channel_name ?? ""),
    testimonialChannelStatus: status
      ? {
          ok: Boolean(status.ok),
          message: String(status.message ?? ""),
        }
      : null,
    googleDriveCredentialsJson: String(payload.googleDriveCredentialsJson ?? payload.google_drive_credentials_json ?? ""),
    googleDriveCredentialsMasked: payload.googleDriveCredentialsMasked ?? payload.google_drive_credentials_masked
      ? String(payload.googleDriveCredentialsMasked ?? payload.google_drive_credentials_masked)
      : null,
    googleDriveServiceEmail: String(payload.googleDriveServiceEmail ?? payload.google_drive_service_email ?? ""),
    googleDriveFolderId: String(payload.googleDriveFolderId ?? payload.google_drive_folder_id ?? ""),
    updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [user, setUser] = useState<UserModel | null>(null);
  const [bots, setBots] = useState<BotModel[]>([]);
  const [groups, setGroups] = useState<GroupModel[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastModel[]>([]);
  const [customerServiceItems, setCustomerServiceItems] = useState<CustomerServiceItemModel[]>([]);
  const [trxGeminiVersion, setTrxGeminiVersion] = useState(0);
  const trxGeminiCacheRef = useRef<{
    geminiPricePlans: GeminiPricePlanModel[] | null;
    googleAccounts: GoogleAccountModel[] | null;
    transactions: TransactionModel[] | null;
  }>({ geminiPricePlans: null, googleAccounts: null, transactions: null });
  const trxGeminiInflightRef = useRef<{
    geminiPricePlans: Promise<GeminiPricePlanModel[]> | null;
    googleAccounts: Promise<GoogleAccountModel[]> | null;
    transactions: Promise<TransactionModel[]> | null;
  }>({ geminiPricePlans: null, googleAccounts: null, transactions: null });

  function invalidateTrxGeminiCache() {
    trxGeminiCacheRef.current.geminiPricePlans = null;
    trxGeminiCacheRef.current.googleAccounts = null;
    trxGeminiCacheRef.current.transactions = null;
    trxGeminiInflightRef.current.geminiPricePlans = null;
    trxGeminiInflightRef.current.googleAccounts = null;
    trxGeminiInflightRef.current.transactions = null;
    setTrxGeminiVersion((version) => version + 1);
  }

  useEffect(() => {
    setUser(auth.user);
  }, [auth.user]);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId) return;

    socketService.connect().catch(() => undefined);
    const unsubscribe = socketService.onTrxGeminiChanged((payload) => {
      const payloadUserId = Number(payload.userId ?? 0);
      if (!payloadUserId || payloadUserId === Number(userId)) {
        invalidateTrxGeminiCache();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [auth.user?.id]);

  async function refreshUser(): Promise<UserModel> {
    const data = await apiFetch("/auth/me");
    const parsed = parseUser((data as { user: Record<string, unknown> }).user);
    setUser(parsed);
    auth.setUserFromCache(parsed);
    return parsed;
  }

  async function refreshBots(): Promise<BotModel[]> {
    const data = await apiFetch("/bot/status");
    const parsed = ((data as { bots: Record<string, unknown>[] }).bots ?? []).map(parseBot);
    setBots(parsed);
    return parsed;
  }

  async function refreshGroups(): Promise<GroupModel[]> {
    const data = await apiFetch("/groups");
    const parsed = ((data as { groups: Record<string, unknown>[] }).groups ?? []).map(parseGroup);
    setGroups(parsed);
    return parsed;
  }

  async function refreshBroadcasts(): Promise<BroadcastModel[]> {
    const data = await apiFetch("/broadcasts");
    const parsed = ((data as { broadcasts: Record<string, unknown>[] }).broadcasts ?? []).map(parseBroadcast);
    setBroadcasts(parsed);
    return parsed;
  }

  async function refreshCustomerService(): Promise<CustomerServiceItemModel[]> {
    const data = await apiFetch("/customer-service");
    const parsed = ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseCustomerService);
    setCustomerServiceItems(parsed);
    return parsed;
  }

  async function preloadForSession(seedUser?: UserModel): Promise<void> {
    if (seedUser) {
      setUser(seedUser);
    }
    await Promise.allSettled([
      seedUser ? Promise.resolve() : refreshUser(),
      refreshBots(),
    ]);
  }

  function clear() {
    setUser(null);
    setBots([]);
    setGroups([]);
    setBroadcasts([]);
    setCustomerServiceItems([]);
    invalidateTrxGeminiCache();
  }

  async function getAdminStats(): Promise<AdminStatsModel> {
    const data = await apiFetch("/owner/stats");
    const stats = (data as { stats: Record<string, unknown> }).stats ?? {};
    return {
      totalBots: Number(stats.totalBots ?? 0),
      totalBroadcasts: Number(stats.totalBroadcasts ?? 0),
    };
  }

  async function fetchActivityLogs(): Promise<ActivityLogModel[]> {
    const data = await apiFetch("/app/activity");
    return ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseActivityLog);
  }

  async function testBroadcastBot(): Promise<string> {
    const data = await apiFetch("/owner/testing/broadcast", { method: "POST" });
    return String((data as { message: string }).message ?? "OK");
  }

  async function testUserBot(): Promise<string> {
    const data = await apiFetch("/bot/test", { method: "POST" });
    return String((data as { message: string }).message ?? "OK");
  }

  function buildBroadcastFormData(payload: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (key === "image") {
        if (value instanceof File) formData.append("image", value);
      } else if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
      } else if (value != null) {
        formData.append(key, String(value));
      }
    }
    return formData;
  }

  async function createBroadcast(payload: Record<string, unknown>): Promise<void> {
    await apiFetch("/broadcasts", { method: "POST", body: buildBroadcastFormData(payload) });
    await refreshBroadcasts();
  }

  async function updateBroadcast(id: number, payload: Record<string, unknown>): Promise<void> {
    await apiFetch(`/broadcasts/${id}`, { method: "PUT", body: buildBroadcastFormData(payload) });
    await refreshBroadcasts();
  }

  async function deleteBroadcast(id: number): Promise<string> {
    const data = await apiFetch(`/broadcasts/${id}`, { method: "DELETE" });
    await refreshBroadcasts();
    return String((data as { message: string }).message ?? "Berhasil dihapus");
  }

  async function createCustomerService(payload: Record<string, unknown>): Promise<CustomerServiceItemModel> {
    const data = await apiFetch("/customer-service", withJsonBody(payload));
    await refreshCustomerService();
    const item = (data as { item: Record<string, unknown> }).item ?? {};
    return parseCustomerService(item);
  }

  async function updateCustomerService(id: number, payload: Record<string, unknown>): Promise<void> {
    await apiFetch(`/customer-service/${id}`, withJsonBody(payload, "PUT"));
    await refreshCustomerService();
  }

  async function deleteCustomerService(id: number): Promise<string> {
    const data = await apiFetch(`/customer-service/${id}`, { method: "DELETE" });
    await refreshCustomerService();
    return String((data as { message: string }).message ?? "Berhasil dihapus");
  }

  async function saveCsButtons(csId: number, buttons: CsButtonModel[]): Promise<CsButtonModel[]> {
    const data = await apiFetch(`/cs-buttons/${csId}`, withJsonBody({ buttons }, "PUT"));
    await refreshCustomerService();
    const items = ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseCsButton);
    return items;
  }

  async function fetchStocksSummary(): Promise<CsStockSummaryModel[]> {
    const data = await apiFetch("/cs-stocks/summary");
    return ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseStockSummary);
  }

  async function fetchStocksForCs(csId: number): Promise<CsStockModel[]> {
    const data = await apiFetch(`/cs-stocks/cs/${csId}`);
    return ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseStock);
  }

  async function addStocks(csId: number, contents: string | string[]): Promise<{ added: number; message: string }> {
    const body = Array.isArray(contents) ? { contents } : { text: contents };
    const data = await apiFetch(`/cs-stocks/cs/${csId}`, withJsonBody(body));
    return {
      added: Number((data as { added: number }).added ?? 0),
      message: String((data as { message: string }).message ?? "OK"),
    };
  }

  async function deleteStock(stockId: number): Promise<string> {
    const data = await apiFetch(`/cs-stocks/${stockId}`, { method: "DELETE" });
    return String((data as { message: string }).message ?? "Berhasil dihapus");
  }

  async function clearStocks(csId: number): Promise<string> {
    const data = await apiFetch(`/cs-stocks/cs/${csId}`, { method: "DELETE" });
    return String((data as { message: string }).message ?? "Stock dikosongkan");
  }

  async function fetchGoogleAccounts(): Promise<GoogleAccountModel[]> {
    if (trxGeminiCacheRef.current.googleAccounts) {
      return trxGeminiCacheRef.current.googleAccounts;
    }
    if (trxGeminiInflightRef.current.googleAccounts) {
      return trxGeminiInflightRef.current.googleAccounts;
    }

    trxGeminiInflightRef.current.googleAccounts = apiFetch("/google-accounts")
      .then((data) => {
        const parsed = ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseGoogleAccount);
        trxGeminiCacheRef.current.googleAccounts = parsed;
        return parsed;
      })
      .finally(() => {
        trxGeminiInflightRef.current.googleAccounts = null;
      });
    return trxGeminiInflightRef.current.googleAccounts;
  }

  async function createGoogleAccount(payload: { email: string }): Promise<GoogleAccountModel> {
    const data = await apiFetch("/google-accounts", withJsonBody(payload));
    invalidateTrxGeminiCache();
    return parseGoogleAccount((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function setGoogleAccountSuspended(accountId: number, suspended: boolean): Promise<GoogleAccountModel> {
    const data = await apiFetch(
      `/google-accounts/${accountId}/suspend`,
      withJsonBody({ suspended }, "PATCH"),
    );
    invalidateTrxGeminiCache();
    return parseGoogleAccount((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function deleteGoogleAccount(accountId: number): Promise<string> {
    const data = await apiFetch(`/google-accounts/${accountId}`, { method: "DELETE" });
    invalidateTrxGeminiCache();
    return String((data as { message: string }).message ?? "Google Account berhasil dihapus");
  }

  async function fetchGeminiPricePlans(): Promise<GeminiPricePlanModel[]> {
    if (trxGeminiCacheRef.current.geminiPricePlans) {
      return trxGeminiCacheRef.current.geminiPricePlans;
    }
    if (trxGeminiInflightRef.current.geminiPricePlans) {
      return trxGeminiInflightRef.current.geminiPricePlans;
    }

    trxGeminiInflightRef.current.geminiPricePlans = apiFetch("/gemini-prices")
      .then((data) => {
        const parsed = ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseGeminiPricePlan);
        trxGeminiCacheRef.current.geminiPricePlans = parsed;
        return parsed;
      })
      .finally(() => {
        trxGeminiInflightRef.current.geminiPricePlans = null;
      });
    return trxGeminiInflightRef.current.geminiPricePlans;
  }

  async function createGeminiPricePlan(payload: Record<string, unknown>): Promise<GeminiPricePlanModel> {
    const data = await apiFetch("/gemini-prices", withJsonBody(payload));
    invalidateTrxGeminiCache();
    return parseGeminiPricePlan((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function updateGeminiPricePlan(priceId: number, payload: Record<string, unknown>): Promise<GeminiPricePlanModel> {
    const data = await apiFetch(`/gemini-prices/${priceId}`, withJsonBody(payload, "PUT"));
    invalidateTrxGeminiCache();
    return parseGeminiPricePlan((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function deleteGeminiPricePlan(priceId: number): Promise<string> {
    const data = await apiFetch(`/gemini-prices/${priceId}`, { method: "DELETE" });
    invalidateTrxGeminiCache();
    return String((data as { message: string }).message ?? "Harga Gemini berhasil dihapus");
  }

  async function fetchPushTemplates(): Promise<PushContactTemplateModel[]> {
    const data = await apiFetch("/push-contact/templates");
    return ((data as { items: Record<string, unknown>[] }).items ?? []).map(parsePushTemplate);
  }

  async function createPushTemplate(payload: { title: string; messageText: string }): Promise<PushContactTemplateModel> {
    const data = await apiFetch("/push-contact/templates", withJsonBody(payload));
    return parsePushTemplate((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function updatePushTemplate(templateId: number, payload: { title: string; messageText: string }): Promise<PushContactTemplateModel> {
    const data = await apiFetch(`/push-contact/templates/${templateId}`, withJsonBody(payload, "PUT"));
    return parsePushTemplate((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function deletePushTemplate(templateId: number): Promise<string> {
    const data = await apiFetch(`/push-contact/templates/${templateId}`, { method: "DELETE" });
    return String((data as { message: string }).message ?? "Template dihapus");
  }

  async function fetchPushStatus(): Promise<{ isRunning: boolean; running: PushContactRunModel | null }> {
    const data = await apiFetch("/push-contact/status");
    const runningRaw = (data as { running?: Record<string, unknown> | null }).running ?? null;
    return {
      isRunning: Boolean((data as { isRunning?: boolean }).isRunning ?? runningRaw),
      running: runningRaw ? parsePushRun(runningRaw) : null,
    };
  }

  async function startPushContact(payload: { templateId: number; groupId: number; botId?: number }): Promise<{ message: string; totalTargets: number; isRunning: boolean; running: PushContactRunModel | null }> {
    const data = await apiFetch("/push-contact/run", withJsonBody(payload));
    const runningRaw = (data as { running?: Record<string, unknown> | null }).running ?? null;
    return {
      message: String((data as { message: string }).message ?? "Push kontak dimulai"),
      totalTargets: Number((data as { totalTargets: number }).totalTargets ?? 0),
      isRunning: Boolean((data as { isRunning?: boolean }).isRunning ?? runningRaw),
      running: runningRaw ? parsePushRun(runningRaw) : null,
    };
  }

  async function fetchGroupPushExclusions(groupId: string): Promise<GroupPushExclusionModel[]> {
    const data = await apiFetch(`/groups/${groupId}/push-exclusions`);
    return ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseGroupPushExclusion);
  }

  async function fetchGroupPushMembers(groupId: string): Promise<GroupPushMemberModel[]> {
    const data = await apiFetch(`/groups/${groupId}/push-members`);
    return ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseGroupPushMember);
  }

  async function addGroupPushExclusion(groupId: string, payload: { phoneNumber: string; label?: string }): Promise<GroupPushExclusionModel> {
    const data = await apiFetch(`/groups/${groupId}/push-exclusions`, withJsonBody(payload));
    return parseGroupPushExclusion((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function deleteGroupPushExclusion(groupId: string, exclusionId: number): Promise<string> {
    const data = await apiFetch(`/groups/${groupId}/push-exclusions/${exclusionId}`, { method: "DELETE" });
    return String((data as { message: string }).message ?? "Pengecualian dihapus");
  }

  async function fetchTransactions(): Promise<TransactionModel[]> {
    if (trxGeminiCacheRef.current.transactions) {
      return trxGeminiCacheRef.current.transactions;
    }
    if (trxGeminiInflightRef.current.transactions) {
      return trxGeminiInflightRef.current.transactions;
    }

    trxGeminiInflightRef.current.transactions = apiFetch("/cs-payments/transactions")
      .then((data) => {
        const parsed = ((data as { items: Record<string, unknown>[] }).items ?? []).map(parseTransaction);
        trxGeminiCacheRef.current.transactions = parsed;
        return parsed;
      })
      .finally(() => {
        trxGeminiInflightRef.current.transactions = null;
      });
    return trxGeminiInflightRef.current.transactions;
  }

  async function refreshTrxGeminiData(): Promise<{
    googleAccounts: GoogleAccountModel[];
    geminiPricePlans: GeminiPricePlanModel[];
    transactions: TransactionModel[];
  }> {
    invalidateTrxGeminiCache();
    const [googleAccounts, geminiPricePlans, transactions] = await Promise.all([
      fetchGoogleAccounts(),
      fetchGeminiPricePlans(),
      fetchTransactions(),
    ]);
    return { googleAccounts, geminiPricePlans, transactions };
  }

  function buildTransactionFormData(payload: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (key === "proofImage") {
        if (value instanceof File) formData.append("proofImage", value);
      } else if (value != null) {
        formData.append(key, String(value));
      }
    }
    return formData;
  }

  async function createManualTransaction(payload: Record<string, unknown>): Promise<TransactionModel> {
    const hasFile = payload.proofImage instanceof File;
    const data = await apiFetch(
      "/cs-payments/transactions",
      hasFile ? { method: "POST", body: buildTransactionFormData(payload) } : withJsonBody(payload),
    );
    invalidateTrxGeminiCache();
    return parseTransaction((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function updateTransaction(transactionId: number, payload: Record<string, unknown>): Promise<TransactionModel> {
    const data = await apiFetch(`/cs-payments/transactions/${transactionId}`, withJsonBody(payload, "PUT"));
    invalidateTrxGeminiCache();
    return parseTransaction((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function updateTransactionReport(transactionId: number, payload: { reportStatus: "proses" | "selesai" }): Promise<TransactionModel> {
    const data = await apiFetch(`/cs-payments/transactions/${transactionId}/report`, withJsonBody(payload, "PATCH"));
    invalidateTrxGeminiCache();
    return parseTransaction((data as { item: Record<string, unknown> }).item ?? {});
  }

  async function deleteTransaction(transactionId: number): Promise<string> {
    const data = await apiFetch(`/cs-payments/transactions/${transactionId}`, { method: "DELETE" });
    invalidateTrxGeminiCache();
    return String((data as { message: string }).message ?? "Transaksi berhasil dihapus");
  }

  async function fetchSettings(): Promise<AppSettingsModel> {
    const data = await apiFetch("/settings");
    return parseAppSettings((data as { settings: Record<string, unknown> }).settings ?? {});
  }

  async function updateSettings(payload: Partial<AppSettingsModel>): Promise<AppSettingsModel> {
    const data = await apiFetch("/settings", withJsonBody(payload, "PUT"));
    return parseAppSettings((data as { settings: Record<string, unknown> }).settings ?? {});
  }

  async function connectBot(data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const result = await apiFetch("/bot/connect", withJsonBody(data));
    return result as Record<string, unknown>;
  }

  async function refreshQr(
    _target: { botId?: number; sessionName?: string },
    data: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const result = await apiFetch("/bot/connect", withJsonBody(data));
    return result as Record<string, unknown>;
  }

  async function cancelPendingBot(sessionName: string): Promise<void> {
    await apiFetch("/bot/cancel-pending", withJsonBody({ sessionName }));
  }

  async function disconnectBot(botId: number): Promise<string> {
    const data = await apiFetch(`/bot/${botId}/disconnect`, { method: "DELETE" });
    await refreshBots();
    return String((data as { message: string }).message ?? "Bot berhasil dihapus");
  }

  async function joinGroup(inviteLink: string, botId?: number): Promise<GroupModel> {
    const data = await apiFetch("/groups/join", withJsonBody({ inviteLink, ...(botId ? { botId } : {}) }));
    const group = parseGroup((data as { group: Record<string, unknown> }).group ?? {});
    await refreshGroups();
    return group;
  }

  async function toggleGroup(groupId: string): Promise<void> {
    await apiFetch(`/groups/${groupId}/toggle`, { method: "PATCH" });
    await refreshGroups();
  }

  async function deleteGroup(groupId: string): Promise<string> {
    const data = await apiFetch(`/groups/${groupId}`, { method: "DELETE" });
    await refreshGroups();
    return String((data as { message: string }).message ?? "Berhasil dihapus");
  }

  const value = useMemo<AppDataContextValue>(
    () => ({
      user,
      bots,
      groups,
      broadcasts,
      customerServiceItems,
      trxGeminiVersion,
      preloadForSession,
      refreshUser,
      refreshBots,
      refreshGroups,
      refreshBroadcasts,
      refreshCustomerService,
      clear,
      getAdminStats,
      fetchActivityLogs,
      testBroadcastBot,
      testUserBot,
      createBroadcast,
      updateBroadcast,
      deleteBroadcast,
      createCustomerService,
      updateCustomerService,
      deleteCustomerService,
      saveCsButtons,
      fetchStocksSummary,
      fetchStocksForCs,
      addStocks,
      deleteStock,
      clearStocks,
      fetchGoogleAccounts,
      createGoogleAccount,
      setGoogleAccountSuspended,
      deleteGoogleAccount,
      fetchGeminiPricePlans,
      createGeminiPricePlan,
      updateGeminiPricePlan,
      deleteGeminiPricePlan,
      fetchPushTemplates,
      createPushTemplate,
      updatePushTemplate,
      deletePushTemplate,
      fetchPushStatus,
      startPushContact,
      fetchGroupPushMembers,
      fetchGroupPushExclusions,
      addGroupPushExclusion,
      deleteGroupPushExclusion,
      fetchTransactions,
      refreshTrxGeminiData,
      createManualTransaction,
      updateTransaction,
      updateTransactionReport,
      deleteTransaction,
      fetchSettings,
      updateSettings,
      connectBot,
      refreshQr,
      cancelPendingBot,
      disconnectBot,
      joinGroup,
      toggleGroup,
      deleteGroup,
    }),
    [user, bots, groups, broadcasts, customerServiceItems, trxGeminiVersion],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return ctx;
}
