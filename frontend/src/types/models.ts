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

export interface BroadcastModel {
  id: number;
  title: string;
  messageText: string;
  imageUrl: string | null;
  isActive: boolean;
  scheduleTimes: string[];
  targetDays: string[];
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
