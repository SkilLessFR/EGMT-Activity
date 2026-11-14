import { useEffect, useState } from "react";
import { ClipboardCheck, History, Users, Wrench } from "lucide-react";
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
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: wordmark + desktop navigation */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-[3px] bg-zinc-100" aria-hidden="true" />
              <span className="text-sm font-semibold tracking-tight text-zinc-100">EGMT</span>
              <span className="hidden text-sm text-zinc-500 sm:inline">Activity</span>
            </div>

            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary sections">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSection(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                      isActive
                        ? "bg-white/[0.07] text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: shift + clock as plain text, roster as a quiet action */}
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-2 px-2 text-xs text-zinc-400"
              title={`${SHIFT_NAMES[primary]} · Europe/Bucharest`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="font-medium text-zinc-200">
                {primary}
                {midActive ? "+MID" : ""}
              </span>
              <span className="font-mono tabular-nums">
                <span className="hidden text-zinc-500 sm:inline">{nowParts.date} · </span>
                {nowParts.time}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenRosterModal}
              title={
                roster
                  ? `Roster ${rosterMonthKey} loaded (${roster.employees.length} staff)`
                  : `Upload roster for ${rosterMonthKey}`
              }
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                roster
                  ? "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                  : "bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {roster ? `${roster.employees.length} Staff` : "Load Roster"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-canvas/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden"
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
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-medium transition ${
                  isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <span
                    className="absolute -top-1.5 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-zinc-100"
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.25 : 1.75} />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
