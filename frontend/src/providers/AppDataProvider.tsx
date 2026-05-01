import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  AdminStatsModel,
  AppSettingsModel,
  BotModel,
  BroadcastModel,
  CsButtonModel,
  CsButtonType,
  CsDeliveryMode,
  CsStockModel,
  CsStockSummaryModel,
  CustomerServiceItemModel,
  GroupModel,
  UserModel,
} from "../types/models";
import { apiFetch, withJsonBody } from "../lib/http";
import { useAuth } from "./AuthProvider";

interface AppDataContextValue {
  user: UserModel | null;
  bots: BotModel[];
  groups: GroupModel[];
  broadcasts: BroadcastModel[];
  customerServiceItems: CustomerServiceItemModel[];
  preloadForSession: (seedUser?: UserModel) => Promise<void>;
  refreshUser: () => Promise<UserModel>;
  refreshBots: () => Promise<BotModel[]>;
  refreshGroups: () => Promise<GroupModel[]>;
  refreshBroadcasts: () => Promise<BroadcastModel[]>;
  refreshCustomerService: () => Promise<CustomerServiceItemModel[]>;
  clear: () => void;
  getAdminStats: () => Promise<AdminStatsModel>;
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
  fetchSettings: () => Promise<AppSettingsModel>;
  updateSettings: (payload: Partial<AppSettingsModel>) => Promise<AppSettingsModel>;
  connectBot: (data?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refreshQr: (target: { botId?: number; sessionName?: string }, data?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  cancelPendingBot: (sessionName: string) => Promise<void>;
  disconnectBot: (botId: number) => Promise<string>;
  joinGroup: (inviteLink: string) => Promise<GroupModel>;
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
  return {
    id: Number(payload.id ?? 0),
    phoneNumber: String(payload.phone_number ?? "-"),
    status: String(payload.status ?? "offline"),
    expiredAt: payload.expired_at ? String(payload.expired_at) : null,
    groupCount: Number(payload.group_count ?? 0),
    activeBroadcastCount: Number(payload.active_broadcast_count ?? 0),
  };
}

function parseGroup(payload: Record<string, unknown>): GroupModel {
  return {
    id: String(payload.id ?? ""),
    name: String(payload.name ?? ""),
    memberCount: Number(payload.member_count ?? 0),
    isActive: Boolean(payload.is_active ?? true),
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

function parseAppSettings(payload: Record<string, unknown>): AppSettingsModel {
  return {
    pakasirSlug: String(payload.pakasirSlug ?? ""),
    pakasirApiKey: String(payload.pakasirApiKey ?? ""),
    pakasirApiKeyMasked: payload.pakasirApiKeyMasked ? String(payload.pakasirApiKeyMasked) : null,
    hasApiKey: Boolean(payload.hasApiKey ?? false),
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
  }

  async function getAdminStats(): Promise<AdminStatsModel> {
    const data = await apiFetch("/owner/stats");
    const stats = (data as { stats: Record<string, unknown> }).stats ?? {};
    return {
      totalBots: Number(stats.totalBots ?? 0),
      totalBroadcasts: Number(stats.totalBroadcasts ?? 0),
    };
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

  async function joinGroup(inviteLink: string): Promise<GroupModel> {
    const data = await apiFetch("/groups/join", withJsonBody({ inviteLink }));
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
      preloadForSession,
      refreshUser,
      refreshBots,
      refreshGroups,
      refreshBroadcasts,
      refreshCustomerService,
      clear,
      getAdminStats,
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
    [user, bots, groups, broadcasts, customerServiceItems],
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
