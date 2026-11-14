import { useEffect, useState } from "react";
import {
  Calendar,
  ClipboardCheck,
  Clock,
  History,
  Upload,
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

const SHIFT_LABELS: Record<Shift, string> = {
  M: "Morning (06:00–14:00)",
  A: "Afternoon (14:00–22:00)",
  N: "Night (22:00–06:00)",
  MID: "Mid (09:00–17:00)",
};

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

  const navItems: Array<{ id: AppSection; label: string; icon: typeof ClipboardCheck }> = [
    { id: "daily", label: "Daily Tasks", icon: ClipboardCheck },
    { id: "downtime", label: "Downtime", icon: Wrench },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand + Live Shift Clock */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/40 bg-slate-900 text-amber-400">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
                  EGMT Activity
                </h1>
                <p className="text-xs text-slate-400">Maintenance Shift Operations</p>
              </div>
            </div>

            {/* Mobile Roster Button */}
            <button
              type="button"
              onClick={onOpenRosterModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 lg:hidden"
            >
              <Upload className="h-3.5 w-3.5 text-amber-400" />
              <span>{roster ? `${rosterMonthKey} (${roster.employees.length})` : "Upload Roster"}</span>
            </button>
          </div>

          {/* Status Strip: Bucharest Date/Time + Active Shift + Desktop Roster */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 font-mono text-slate-200">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>{nowParts.date}</span>
              <span className="text-slate-600">|</span>
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>{nowParts.time}</span>
              <span className="hidden text-slate-500 sm:inline">EET/EEST</span>
            </div>

            <div
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-medium text-amber-300"
              title={SHIFT_LABELS[primary]}
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>
                Shift {primary}
                {midActive ? " + MID" : ""}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenRosterModal}
              className={`hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium transition lg:inline-flex ${
                roster
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>
                {roster
                  ? `Roster ${rosterMonthKey} · ${roster.employees.length} staff`
                  : `No Roster (${rosterMonthKey})`}
              </span>
              <Upload className="ml-1 h-3.5 w-3.5 opacity-80" />
            </button>
          </div>
        </div>

        {/* 3 Primary Navigation Tabs */}
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Primary sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-amber-400 text-amber-300"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
