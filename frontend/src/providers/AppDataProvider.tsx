import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  AdminStatsModel,
  BotModel,
  BroadcastModel,
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
  createCustomerService: (data: Record<string, unknown>) => Promise<void>;
  updateCustomerService: (id: number, data: Record<string, unknown>) => Promise<void>;
  deleteCustomerService: (id: number) => Promise<string>;
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

function parseCustomerService(payload: Record<string, unknown>): CustomerServiceItemModel {
  return {
    id: Number(payload.id ?? 0),
    botId: Number(payload.bot_id ?? 0),
    botPhoneNumber: String(payload.bot_phone_number ?? "-"),
    commandName: String(payload.command_name ?? ""),
    value: String(payload.value ?? ""),
    createdAt: String(payload.created_at ?? ""),
    updatedAt: String(payload.updated_at ?? ""),
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

  async function createCustomerService(payload: Record<string, unknown>): Promise<void> {
    await apiFetch("/customer-service", withJsonBody(payload));
    await refreshCustomerService();
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
