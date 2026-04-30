import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type ToastTone = "info" | "success" | "danger";
type ToastPosition = "top-right" | "top-right-form" | "bottom-right";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  position: ToastPosition;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone, position?: ToastPosition) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showToast = useCallback((
    message: string,
    tone: ToastTone = "info",
    position: ToastPosition = "top-right",
  ) => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setItems((current) => [...current, { id, message, tone, position }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const topRightItems = items.filter(
    (item) => item.position === "top-right" || item.position === "bottom-right",
  );
  const topRightFormItems = items.filter((item) => item.position === "top-right-form");

  function renderToast(item: ToastItem) {
    return (
      <div
        key={item.id}
        className={[
          "ml-auto w-fit max-w-[calc(100vw-3rem)] rounded-[14px] border px-4 py-3.5 text-left text-sm leading-6 break-words shadow-soft sm:max-w-[360px]",
          item.tone === "danger"
            ? "bg-[rgba(127,29,29,0.96)] text-white"
            : item.tone === "success"
              ? "bg-[rgba(20,83,45,0.96)] text-white"
              : "bg-[rgba(30,41,59,0.95)] text-text-primary",
          item.tone === "success"
            ? "border-[rgba(34,197,94,0.35)]"
            : item.tone === "danger"
              ? "border-[rgba(239,68,68,0.35)]"
              : "border-glass-border",
        ].join(" ")}
      >
        {item.message}
      </div>
    );
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-100 grid justify-items-end gap-2.5">
        {topRightItems.map(renderToast)}
      </div>
      <div className="fixed bottom-6 right-6 z-100 grid justify-items-end gap-2.5">
        {topRightFormItems.map(renderToast)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
