export interface UserModel {
  id: number;
  username: string;
  createdAt: string;
}

export interface BotModel {
  id: number;
  phoneNumber: string;
  status: string;
  expiredAt: string | null;
  groupCount: number;
  activeBroadcastCount: number;
}

export interface GroupModel {
  id: string;
  name: string;
  memberCount: number;
  isActive: boolean;
}

export interface BroadcastScheduleEntry {
  time: string; // "HH:MM"
  days: string[]; // normalized lowercase day keys: senin, selasa, ...
}

export interface BroadcastModel {
  id: number;
  title: string;
  messageText: string;
  imageUrl: string | null;
  isActive: boolean;
  schedules: BroadcastScheduleEntry[];
  targetGroupIds: number[];
  targetExcludedGroupIds: number[];
  targetBotIds: number[];
  createdAt: string;
}

export type CsDeliveryMode = "none" | "stock" | "relay";

export type CsButtonType = "link" | "buy" | "reply";

export interface CsButtonModel {
  id?: number;
  label: string;
  buttonType: CsButtonType;
  targetCommand: string | null;
  targetUrl: string | null;
  replyText: string | null;
  price: number | null;
  orderIndex: number;
}

export interface CustomerServiceItemModel {
  id: number;
  commandName: string;
  value: string;
  deliveryMode: CsDeliveryMode;
  price: number | null;
  relayPrompt: string | null;
  relayWaitingText: string | null;
  relayOwnerInstruction: string | null;
  relayDoneText: string | null;
  buttons: CsButtonModel[];
  createdAt: string;
  updatedAt: string;
}

export interface CsStockModel {
  id: number;
  csId: number;
  content: string;
  isUsed: boolean;
  usedByJid: string | null;
  usedAt: string | null;
  createdAt: string;
}

export interface CsStockSummaryModel {
  csId: number;
  commandName: string;
  deliveryMode: CsDeliveryMode;
  price: number | null;
  total: number;
  available: number;
  used: number;
}

export interface AppSettingsModel {
  pakasirSlug: string;
  pakasirApiKey: string;
  pakasirApiKeyMasked: string | null;
  hasApiKey: boolean;
  updatedAt: string | null;
}

export interface AdminStatsModel {
  totalBots: number;
  totalBroadcasts: number;
}
