import { useEffect, useRef } from "react";

const SYNC_POLL_INTERVAL_MS = 10_000;

/**
 * Polls `/api/sync` (1 lightweight KV read) every 10s while the tab/PWA is visible,
 * plus immediately on window focus / visibilitychange / online, and invokes `onSync`
 * whenever another device has written new data.
 */
export function useRealtimeSync(onSync: () => void | Promise<void>): void {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const lastVersionRef = useRef<string | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    let active = true;

    const checkForUpdates = async () => {
      if (!active || checkingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }

      checkingRef.current = true;
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        const nextVersion = data?.version;
        if (!nextVersion) return;

        if (lastVersionRef.current === null) {
          lastVersionRef.current = nextVersion;
          return;
        }

        if (nextVersion !== lastVersionRef.current) {
          lastVersionRef.current = nextVersion;
          await onSyncRef.current();
        }
      } catch {
        // Ignore transient network errors during background sync
      } finally {
        checkingRef.current = false;
      }
    };

    void checkForUpdates();

    const intervalId = window.setInterval(() => {
      void checkForUpdates();
    }, SYNC_POLL_INTERVAL_MS);

    const handleWake = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdates();
      }
    };

    window.addEventListener("focus", handleWake);
    window.addEventListener("online", handleWake);
    document.addEventListener("visibilitychange", handleWake);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWake);
      window.removeEventListener("online", handleWake);
      document.removeEventListener("visibilitychange", handleWake);
    };
  }, []);
}
