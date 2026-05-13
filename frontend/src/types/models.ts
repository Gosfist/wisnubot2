export interface UserModel {
  id: number;
  username: string;
  createdAt: string;
}

export interface BotModel {
  id: number;
  phoneNumber: string;
  purpose: "main" | "push_contact";
  status: string;
  expiredAt: string | null;
  groupCount: number;
  activeBroadcastCount: number;
}

export interface GroupModel {
  id: string;
  botId: number;
  botPhoneNumber: string;
  botPurpose: "main" | "push_contact";
  name: string;
  memberCount: number;
  isActive: boolean;
}

export interface PushContactTemplateModel {
  id: number;
  title: string;
  messageText: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PushContactRunModel {
  id: number;
  status: string;
  totalTargets: number;
  successCount: number;
  failedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface GroupPushExclusionModel {
  id: number;
  groupId: number;
  phoneNumber: string;
  label: string | null;
  createdAt: string | null;
}

export interface GroupPushMemberModel {
  jid: string;
  phoneNumber: string;
  displayName: string;
  isAdmin: boolean;
  isBot: boolean;
  isExcluded: boolean;
  exclusionId: number | null;
  exclusionLabel: string | null;
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
  activeDurationDays: number | null;
  warrantyDurationDays: number | null;
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

export interface GoogleAccountModel {
  id: number;
  email: string;
  totalSlots: number;
  usedSlots: number;
  createdAt: string | null;
}

export interface TransactionModel {
  id: number;
  idTrx: string;
  googleAccountId: number | null;
  customerJid: string;
  amount: number;
  status: string;
  commandName: string | null;
  googleAccountEmail: string | null;
  buyerEmail: string | null;
  stockContent: string | null;
  platform: string;
  memberStatus: "anggota" | "kick";
  isManual: boolean;
  activeDurationDays: number | null;
  warrantyDurationDays: number | null;
  completedAt: string | null;
  activeStartAt: string | null;
  activeExpiresAt: string | null;
  warrantyStartAt: string | null;
  warrantyExpiresAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
}

export interface AppSettingsModel {
  pakasirSlug: string;
  pakasirApiKey: string;
  pakasirApiKeyMasked: string | null;
  hasApiKey: boolean;
  testimonialChannelLink: string;
  testimonialChannelJid: string;
  testimonialChannelName: string;
  testimonialChannelStatus: { ok: boolean; message: string } | null;
  updatedAt: string | null;
}

export interface AdminStatsModel {
  totalBots: number;
  totalBroadcasts: number;
}

export interface ActivityLogModel {
  id: number;
  action: string;
  detail: string;
  createdAt: string | null;
}
