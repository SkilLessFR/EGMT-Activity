import type { ButtonHTMLAttributes, ReactNode } from "react";

export const inputClassName =
  "w-full rounded-lg border border-white/[0.08] bg-surface-input px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-white/25 focus:outline-none focus:ring-4 focus:ring-white/[0.05]";

export const selectClassName =
  "w-full rounded-lg border border-white/[0.08] bg-surface-input px-3 py-2 text-sm text-zinc-100 transition focus:border-white/25 focus:outline-none focus:ring-4 focus:ring-white/[0.05]";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "emerald";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Primary is high-contrast white: the one loud element on a quiet screen.
  primary: "bg-zinc-100 text-zinc-950 font-semibold hover:bg-white active:scale-[0.98]",
  secondary:
    "border border-white/[0.08] bg-white/[0.03] text-zinc-200 font-medium hover:bg-white/[0.07] hover:border-white/[0.14]",
  ghost: "text-zinc-400 font-medium hover:bg-white/[0.06] hover:text-zinc-100",
  danger: "text-red-300 font-medium bg-red-500/10 hover:bg-red-500/20",
  emerald: "text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[34px] px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "min-h-[40px] px-4 py-2 text-sm rounded-lg gap-2",
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
      className={`inline-flex items-center justify-center transition disabled:pointer-events-none disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

type BadgeTone = "neutral" | "amber" | "emerald" | "red" | "sky" | "indigo";

// Borderless, low-fill chips. Colour only where it carries meaning.
const BADGE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-white/[0.05] text-zinc-400",
  amber: "bg-amber-500/10 text-amber-300",
  emerald: "bg-emerald-500/10 text-emerald-300",
  red: "bg-red-500/10 text-red-300",
  sky: "bg-sky-500/10 text-sky-300",
  indigo: "bg-indigo-500/10 text-indigo-300",
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
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${BADGE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

type DotTone = "neutral" | "amber" | "emerald" | "red" | "sky";

const DOT_CLASSES: Record<DotTone, string> = {
  neutral: "bg-zinc-600",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  red: "bg-red-400",
  sky: "bg-sky-400",
};

/** Small status dot + optional label. Preferred over badges for task/row status. */
export function StatusDot({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: DotTone;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-medium text-zinc-200">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse border-b border-white/[0.06] py-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-12 rounded bg-white/[0.06]" />
        <div className="h-4 w-1/2 rounded bg-white/[0.06]" />
      </div>
      <div className="mt-3 flex gap-2 pl-[3.75rem]">
        <div className="h-9 w-24 rounded-lg bg-white/[0.04]" />
        <div className="h-9 w-24 rounded-lg bg-white/[0.04]" />
      </div>
    </div>
  );
}
