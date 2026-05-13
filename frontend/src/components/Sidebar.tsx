import type { LucideIcon } from "lucide-react";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "../lib/cn";
import { WisnuBotLogo } from "./WisnuBotLogo";

export interface NavItem {
  to?: string;
  label: string;
  end?: boolean;
  children?: NavItem[];
}

export interface SidebarFooterAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void | Promise<void>;
}

export function Sidebar({
  items,
  footerAction,
  open,
  onClose,
}: {
  items: NavItem[];
  footerAction?: SidebarFooterAction;
  open: boolean;
  onClose: () => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();

  function isRouteMatch(path: string, end?: boolean) {
    if (end) {
      return location.pathname === path;
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  function isGroupActive(item: NavItem) {
    if (!item.children?.length) {
      return false;
    }

    return item.children.some((child) => (child.to ? isRouteMatch(child.to, child.end) : false));
  }

  useEffect(() => {
    setExpandedGroups((current) => {
      const nextState = { ...current };

      for (const item of items) {
        if (!item.children?.length) {
          continue;
        }

        if (isGroupActive(item)) {
          nextState[item.label] = true;
        }
      }

      return nextState;
    });
  }, [location.pathname, items]);

  function handleFooterAction() {
    onClose();
    void footerAction?.onClick();
  }

  function toggleGroup(label: string) {
    setExpandedGroups((current) => ({
      ...current,
      [label]: !(current[label] ?? true),
    }));
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-20 bg-[rgba(15,23,42,0.98)] transition-opacity duration-200 lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex h-dvh min-h-dvh max-h-dvh w-full flex-col overflow-hidden border-r border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.98)] px-[18px] py-6 shadow-soft transition-transform duration-200 sm:w-[320px] lg:sticky lg:top-0 lg:h-screen lg:min-h-screen lg:max-h-screen lg:w-[280px] lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-7 flex items-center justify-between gap-3.5">
          <div className="flex items-center gap-3.5">
            <WisnuBotLogo size={26} withContainer />
            <div>
              <strong className="block font-display">WisnuBot</strong>
            </div>
          </div>
          <button
            className="flex size-11 items-center justify-center rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(148,163,184,0.08)] text-text-secondary transition hover:border-[rgba(56,189,248,0.28)] hover:bg-[rgba(148,163,184,0.14)] hover:text-white lg:hidden"
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="grid flex-1 content-start gap-2">
          {items.map((item, itemIndex) => {
            const key = `${item.label}-${itemIndex}`;

            if (item.children?.length) {
              const isExpanded = expandedGroups[item.label] ?? isGroupActive(item);

              return (
                <div key={key} className="space-y-1">
                  <button
                    className="flex w-full items-center justify-between rounded-[14px] px-4 py-[14px] text-left text-text-secondary transition hover:bg-[rgba(148,163,184,0.08)]"
                    type="button"
                    onClick={() => toggleGroup(item.label)}
                    aria-expanded={isExpanded}
                  >
                    <span>{item.label}</span>
                    <ChevronDown
                      size={14}
                      className={cn("transition-transform", isExpanded ? "rotate-180" : "rotate-0")}
                    />
                  </button>
                  {isExpanded ? (
                    <div className="grid gap-1 pl-2">
                      {item.children.map((child, childIndex) => {
                        if (!child.to) {
                          return null;
                        }

                        return (
                          <NavLink
                            key={`${key}-child-${child.label}-${childIndex}`}
                            to={child.to}
                            end={child.end}
                            className={({ isActive }) =>
                              cn(
                                "rounded-[14px] px-4 py-[14px] text-text-secondary transition",
                                isActive &&
                                  "border border-[rgba(37,99,235,0.28)] bg-[rgba(37,99,235,0.16)] text-accent",
                              )
                            }
                            onClick={onClose}
                          >
                            {child.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            if (!item.to) {
              return null;
            }

            return (
              <NavLink
                key={key}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-[14px] px-4 py-[14px] text-text-secondary transition",
                    isActive &&
                      "border border-[rgba(37,99,235,0.28)] bg-[rgba(37,99,235,0.16)] text-accent",
                  )
                }
                onClick={onClose}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        {footerAction ? (
          <div className="mt-auto border-t border-[rgba(56,189,248,0.12)] pt-4">
            <button
              className="flex w-full items-center gap-3 rounded-[14px] border border-[rgba(239,68,68,0.2)] px-4 py-[14px] text-left text-danger transition hover:bg-[rgba(239,68,68,0.1)]"
              type="button"
              onClick={handleFooterAction}
            >
              <footerAction.icon size={18} />
              <span className="font-semibold">{footerAction.label}</span>
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
