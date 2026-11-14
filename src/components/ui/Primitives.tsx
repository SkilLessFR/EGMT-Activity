import type { ButtonHTMLAttributes, ReactNode } from "react";

export const inputClassName =
  "w-full rounded-lg border border-white/[0.1] bg-surface-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-400/15";

export const selectClassName =
  "w-full rounded-lg border border-white/[0.1] bg-surface-input px-3 py-2 text-sm text-slate-100 transition focus:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-400/15";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "emerald";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 active:scale-[0.98] shadow-sm",
  secondary:
    "border border-white/[0.1] bg-white/[0.05] text-slate-200 font-medium hover:bg-white/[0.09] hover:border-white/[0.15]",
  ghost:
    "text-slate-400 font-medium hover:bg-white/[0.06] hover:text-slate-100",
  danger:
    "border border-red-500/30 bg-red-500/10 text-red-300 font-medium hover:bg-red-500/20",
  emerald:
    "border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 font-semibold hover:bg-emerald-500/25",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[34px] px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "min-h-[40px] px-4 py-2 text-sm rounded-xl gap-2",
};

export function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center transition disabled:pointer-events-none disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

type BadgeTone = "neutral" | "amber" | "emerald" | "red" | "sky" | "indigo";

const BADGE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-white/[0.08] bg-white/[0.04] text-slate-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  red: "border-red-500/30 bg-red-500/10 text-red-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${BADGE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-surface/50 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.05] text-slate-400">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/[0.06] bg-surface-card p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-14 rounded-md bg-white/[0.06]" />
        <div className="h-5 w-20 rounded-md bg-white/[0.05]" />
      </div>
      <div className="mt-3 h-4 w-2/3 rounded bg-white/[0.07]" />
      <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.04]" />
      <div className="mt-4 flex gap-2 border-t border-white/[0.05] pt-3">
        <div className="h-10 w-28 rounded-xl bg-white/[0.06]" />
        <div className="h-10 w-28 rounded-xl bg-white/[0.06]" />
      </div>
    </div>
  );
}
