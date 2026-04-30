import { Bot, Send } from "lucide-react";
import type { PackageStatus } from "../types/models";
import { formatDate } from "../lib/format";
import { TierBadge } from "./TierBadge";
import { SurfaceCard } from "./SurfaceCard";

export function BotCard({
  name,
  expiredDate,
  packageStatus,
  botPhoneNumber,
  botStatus,
  isTesting,
  onConnectBot,
  onTestBot,
}: {
  name: string;
  expiredDate: string | null;
  packageStatus: PackageStatus;
  botPhoneNumber: string | null;
  botStatus: "online" | "offline" | null;
  isTesting: boolean;
  onConnectBot: () => void;
  onTestBot: () => void;
}) {
  const isConnected = botStatus === "online";

  return (
    <SurfaceCard className="flex flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{name}</h3>
          <p className="mt-1 text-sm text-text-secondary">Exp: {expiredDate ? formatDate(expiredDate) : "-"}</p>
        </div>
        <TierBadge status={packageStatus} />
      </div>
      
      <p className="text-sm text-text-secondary">
        {botPhoneNumber ? (
          <>
            <span className={isConnected ? "text-success" : "text-danger"}>{isConnected ? "Online" : "Offline"}</span>
            {" : "}
            <span>{botPhoneNumber}</span>
          </>
        ) : (
          "Belum ada bot terhubung"
        )}
      </p>

      <div className={`mt-4 grid gap-3 ${isConnected ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-linear-to-r from-primary to-accent px-4 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
          type="button"
          onClick={onConnectBot}
        >
          <Bot size={16} />
          {botPhoneNumber ? "Ganti Bot" : "Tambahkan Bot"}
        </button>

        {isConnected ? (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.8)] px-4 py-3.5 text-sm font-bold text-text-primary transition hover:border-[rgba(56,189,248,0.38)] hover:bg-[rgba(30,41,59,0.94)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onTestBot}
            disabled={isTesting}
          >
            <Send size={16} />
            {isTesting ? "Mengirim..." : "Test Bot"}
          </button>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
