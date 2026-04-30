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

export interface CustomerServiceItemModel {
  id: number;
  botId: number;
  botPhoneNumber: string;
  commandName: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStatsModel {
  totalBots: number;
  totalBroadcasts: number;
}
