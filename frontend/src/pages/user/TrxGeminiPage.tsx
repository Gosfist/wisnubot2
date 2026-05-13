import { useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { cn } from "../../lib/cn";
import { GoogleAccountsPage } from "./GoogleAccountsPage";
import { TransactionsPage } from "./TransactionsPage";

type TrxGeminiTab = "trx" | "account";

const tabs: { id: TrxGeminiTab; label: string }[] = [
  { id: "trx", label: "Transaksi Manual" },
  { id: "account", label: "Google Account" },
];

export function TrxGeminiPage() {
  const [activeTab, setActiveTab] = useState<TrxGeminiTab>("trx");

  return (
    <div className="space-y-5">
      <PageHeader title="TRX Gemini" />

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "rounded-[14px] border px-5 py-3 text-sm font-bold transition",
              activeTab === tab.id
                ? "border-[rgba(37,99,235,0.36)] bg-[rgba(37,99,235,0.22)] text-white"
                : "border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.62)] text-text-secondary hover:bg-[rgba(56,189,248,0.08)] hover:text-white",
            )}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "trx" ? <TransactionsPage embedded /> : <GoogleAccountsPage embedded />}
    </div>
  );
}
