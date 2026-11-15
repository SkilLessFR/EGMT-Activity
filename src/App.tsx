import { useCallback, useEffect, useState } from "react";
import { fetchRoster } from "./api/client";
import { DailyTasksView } from "./components/DailyTasksView";
import { DowntimeView } from "./components/DowntimeView";
import { Header, type AppSection } from "./components/Header";
import { HistoryView } from "./components/HistoryView";
import { RosterModal } from "./components/RosterModal";
import { ScheduledMaintenanceView } from "./components/ScheduledMaintenanceView";
import { ToastProvider } from "./components/ui/Toast";
import { getBucharestDate } from "./shared/timezone";
import type { RosterData } from "./shared/types";

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("daily");
  const [rosterModalOpen, setRosterModalOpen] = useState(false);

  const currentMonthKey = getBucharestDate().slice(0, 7);
  const [rosterCache, setRosterCache] = useState<Record<string, RosterData | null>>({});

  useEffect(() => {
    let cancelled = false;
    fetchRoster(currentMonthKey)
      .then((roster) => {
        if (!cancelled) {
          setRosterCache((prev) => ({ ...prev, [currentMonthKey]: roster }));
        }
      })
      .catch(() => {
        // Individual views handle roster fetch errors gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [currentMonthKey]);

  const handleRosterLoaded = useCallback((monthKey: string, roster: RosterData | null) => {
    setRosterCache((prev) => ({ ...prev, [monthKey]: roster }));
  }, []);

  const handleRosterUploaded = useCallback((roster: RosterData, monthKey: string) => {
    setRosterCache((prev) => ({ ...prev, [monthKey]: roster }));
  }, []);

  const currentRoster = rosterCache[currentMonthKey] ?? null;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-canvas text-zinc-100">
        <Header
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          roster={currentRoster}
          rosterMonthKey={currentMonthKey}
          onOpenRosterModal={() => setRosterModalOpen(true)}
        />

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 md:pb-12">
          {activeSection === "daily" && (
            <DailyTasksView
              rosterCache={rosterCache}
              onRosterLoaded={handleRosterLoaded}
              onOpenRosterModal={() => setRosterModalOpen(true)}
            />
          )}
          {activeSection === "scheduled" && (
            <ScheduledMaintenanceView
              roster={currentRoster}
              onOpenRosterModal={() => setRosterModalOpen(true)}
            />
          )}
          {activeSection === "downtime" && (
            <DowntimeView
              rosterCache={rosterCache}
              onRosterLoaded={handleRosterLoaded}
              onOpenRosterModal={() => setRosterModalOpen(true)}
            />
          )}
          {activeSection === "history" && <HistoryView roster={currentRoster} />}
        </main>

        <RosterModal
          isOpen={rosterModalOpen}
          onClose={() => setRosterModalOpen(false)}
          currentRoster={currentRoster}
          onRosterUploaded={handleRosterUploaded}
        />
      </div>
    </ToastProvider>
  );
}
