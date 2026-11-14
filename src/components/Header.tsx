import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  History,
  Users,
  Wrench,
} from "lucide-react";
import { getBucharestNowParts } from "../shared/timezone";
import type { RosterData, Shift } from "../shared/types";

export type AppSection = "daily" | "downtime" | "history";

interface HeaderProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  roster: RosterData | null;
  rosterMonthKey: string;
  onOpenRosterModal: () => void;
}

function getActiveShiftsAtTime(hours: number): { primary: Shift; midActive: boolean } {
  let primary: Shift = "N";
  if (hours >= 6 && hours < 14) {
    primary = "M";
  } else if (hours >= 14 && hours < 22) {
    primary = "A";
  }
  const midActive = hours >= 9 && hours < 17;
  return { primary, midActive };
}

const SHIFT_NAMES: Record<Shift, string> = {
  M: "Morning 06:00–14:00",
  A: "Afternoon 14:00–22:00",
  N: "Night 22:00–06:00",
  MID: "Midday 09:00–17:00",
};

const NAV_ITEMS: Array<{ id: AppSection; label: string; shortLabel: string; icon: typeof ClipboardCheck }> = [
  { id: "daily", label: "Daily Tasks", shortLabel: "Daily", icon: ClipboardCheck },
  { id: "downtime", label: "Downtime", shortLabel: "Downtime", icon: Wrench },
  { id: "history", label: "History", shortLabel: "History", icon: History },
];

export function Header({
  activeSection,
  onSelectSection,
  roster,
  rosterMonthKey,
  onOpenRosterModal,
}: HeaderProps) {
  const [nowParts, setNowParts] = useState(() => getBucharestNowParts());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowParts(getBucharestNowParts());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const { primary, midActive } = getActiveShiftsAtTime(nowParts.hours);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          {/* Left: Brand + Desktop Navigation */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
                <Wrench className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-100 sm:text-base">
                EGMT Activity
              </span>
            </div>

            <nav
              className="hidden items-center gap-1 rounded-xl border border-white/[0.07] bg-surface p-1 md:flex"
              aria-label="Primary sections"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSection(item.id)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-white/[0.1] text-slate-100 shadow-sm"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? "text-amber-400" : ""}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Compact Shift/Time Status + Roster Access */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-surface px-2.5 py-1.5 text-xs"
              title={`${SHIFT_NAMES[primary]} · Europe/Bucharest`}
            >
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span>
                  {primary}
                  {midActive ? "+MID" : ""}
                </span>
              </span>
              <span className="text-white/15">|</span>
              <span className="font-mono tabular-nums text-slate-300">
                <span className="hidden sm:inline">{nowParts.date} · </span>
                {nowParts.time}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenRosterModal}
              title={roster ? `Roster ${rosterMonthKey} loaded (${roster.employees.length} staff)` : `Upload roster for ${rosterMonthKey}`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                roster
                  ? "border-white/[0.08] bg-surface text-slate-300 hover:border-white/[0.15] hover:text-slate-100"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              }`}
            >
              <Users className={`h-3.5 w-3.5 ${roster ? "text-emerald-400" : "text-amber-400"}`} />
              <span className="hidden sm:inline">
                {roster ? `${roster.employees.length} Staff` : "Load Roster"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-canvas/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-3 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-white/[0.09] text-amber-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
