import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      window.setTimeout(() => {
        dismiss(id);
      }, toast.tone === "error" ? 5500 : 3500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-5 sm:left-auto sm:right-5 sm:items-end sm:px-0"
      >
        {toasts.map((t) => {
          const Icon =
            t.tone === "success"
              ? CheckCircle2
              : t.tone === "error"
                ? AlertCircle
                : Info;
          // Neutral surface for every tone; only the icon carries colour.
          const toneClasses = "bg-surface-elevated/95 text-zinc-100";
          const iconColor =
            t.tone === "success"
              ? "text-emerald-400"
              : t.tone === "error"
                ? "text-red-400"
                : "text-zinc-400";

          return (
            <div
              key={t.id}
              className={`animate-modal-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-3.5 py-3 shadow-modal backdrop-blur-md ${toneClasses}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-zinc-400">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
