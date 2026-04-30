import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar, type NavItem, type SidebarFooterAction } from "./Sidebar";

export function AppShell({
  items,
  footerAction,
  children,
}: {
  items: NavItem[];
  footerAction?: SidebarFooterAction;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;

    if (open) {
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  return (
    <div className="flex h-dvh min-h-dvh max-h-dvh overflow-hidden">
      <Sidebar items={items} footerAction={footerAction} open={open} onClose={() => setOpen(false)} />
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col lg:w-[calc(100%-280px)]">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[rgba(56,189,248,0.18)] bg-[rgba(15,23,42,0.84)] px-5 py-3.5 backdrop-blur-[18px] lg:hidden">
          <button
            className="rounded-xl bg-[rgba(148,163,184,0.08)] p-3 text-text-secondary transition hover:bg-[rgba(148,163,184,0.14)]"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={18} />
          </button>
          <strong className="font-display">WisnuBot</strong>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-5 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
