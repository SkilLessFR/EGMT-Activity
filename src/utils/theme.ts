export type ColorSchemeOverride = "light" | "dark" | null;

const STORAGE_KEY = "color-scheme";

export function getStoredColorScheme(): ColorSchemeOverride {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === "light" || val === "dark" ? val : null;
  } catch {
    return null;
  }
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyColorSchemeMeta(override: ColorSchemeOverride): void {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = override ?? "light dark";
  }
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) {
    const isDark = override ? override === "dark" : getSystemPrefersDark();
    themeMeta.content = isDark ? "#09090b" : "#ffffff";
  }
}

/**
 * Two-state toggle following modern-web-guidance:
 * - Target is the opposite of the currently rendered scheme.
 * - If target matches the current system preference, removes the stored override
 *   so the site follows the system again.
 * - Otherwise persists the literal target in localStorage.
 */
export function toggleColorScheme(): ColorSchemeOverride {
  const stored = getStoredColorScheme();
  const systemDark = getSystemPrefersDark();
  const currentlyDark = stored ? stored === "dark" : systemDark;
  const target: "light" | "dark" = currentlyDark ? "light" : "dark";
  const systemScheme: "light" | "dark" = systemDark ? "dark" : "light";

  let nextOverride: ColorSchemeOverride;
  if (target === systemScheme) {
    nextOverride = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  } else {
    nextOverride = target;
    try {
      localStorage.setItem(STORAGE_KEY, target);
    } catch {
      // Ignore storage errors
    }
  }

  applyColorSchemeMeta(nextOverride);
  return nextOverride;
}
