import { io, Socket } from "socket.io-client";
import { appConfig } from "./config";
import { getStoredUser, getToken } from "./storage";

type BotStatusListener = (payload: Record<string, unknown>) => void;
type TrxGeminiListener = (payload: Record<string, unknown>) => void;
type QrListener = (qr: string) => void;

class SocketService {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private joinedUserId: number | null = null;
  private qrListeners = new Set<QrListener>();
  private botStatusListeners = new Set<BotStatusListener>();
  private trxGeminiListeners = new Set<TrxGeminiListener>();

  async connect() {
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this.connectInternal();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectInternal() {
    const token = getToken();
    const user = getStoredUser();

    if (this.socket?.connected) {
      this.joinUserRoom(user?.id ?? null);
      return;
    }

    if (!this.socket) {
      this.socket = io(appConfig.socketBaseUrl, {
        transports: ["websocket"],
        autoConnect: false,
        extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      this.socket.on("connect", () => {
        this.joinUserRoom(user?.id ?? null);
      });

      this.socket.on("qr", (payload: unknown) => {
        if (typeof payload === "string") {
          this.qrListeners.forEach((listener) => listener(payload));
          return;
        }

        if (typeof payload === "object" && payload !== null && "qr" in payload) {
          this.qrListeners.forEach((listener) =>
            listener(String((payload as Record<string, unknown>).qr)),
          );
        }
      });

      this.socket.on("connected", (payload: unknown) => {
        if (typeof payload === "object" && payload !== null) {
          this.emitBotStatus({ ...(payload as Record<string, unknown>), status: "online" });
        }
      });

      this.socket.on("disconnected", (payload: unknown) => {
        if (typeof payload === "object" && payload !== null) {
          this.emitBotStatus({ ...(payload as Record<string, unknown>), status: "offline" });
        }
      });

      this.socket.on("bot_status", (payload: unknown) => {
        if (typeof payload === "object" && payload !== null) {
          this.emitBotStatus(payload as Record<string, unknown>);
        }
      });

      this.socket.on("trx_gemini_changed", (payload: unknown) => {
        if (typeof payload === "object" && payload !== null) {
          this.trxGeminiListeners.forEach((listener) =>
            listener(payload as Record<string, unknown>),
          );
        }
      });

      this.socket.on("disconnect", () => {
        this.joinedUserId = null;
      });
    }

    await new Promise<void>((resolve) => {
      this.socket?.connect();
      if (this.socket?.connected) {
        resolve();
        return;
      }
      this.socket?.once("connect", () => resolve());
    });
  }

  private emitBotStatus(payload: Record<string, unknown>) {
    this.botStatusListeners.forEach((listener) => listener(payload));
  }

  private joinUserRoom(userId: number | null) {
    if (!userId || !this.socket?.connected || this.joinedUserId === userId) {
      return;
    }
    this.socket.emit("join", userId);
    this.joinedUserId = userId;
  }

  onQr(listener: QrListener) {
    this.qrListeners.add(listener);
    return () => this.qrListeners.delete(listener);
  }

  onBotStatus(listener: BotStatusListener) {
    this.botStatusListeners.add(listener);
    return () => this.botStatusListeners.delete(listener);
  }

  onTrxGeminiChanged(listener: TrxGeminiListener) {
    this.trxGeminiListeners.add(listener);
    return () => this.trxGeminiListeners.delete(listener);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = null;
    this.joinedUserId = null;
    this.connecting = null;
  }
}

export const socketService = new SocketService();
