"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "@ui/icons";
import { useTheme } from "next-themes";
import { cn } from "@/lib/cn";

/**
 * The appearance selector: a three-way segmented toggle (Light / Dark / System)
 * with a pill that slides to the active option. It's a `radiogroup` whose value
 * is next-themes' `theme` — picking a segment calls `setTheme`, which persists
 * the choice to `localStorage`, follows the OS while "System" is selected, and
 * re-stamps `data-theme` on `<html>`.
 *
 * next-themes can't know the stored choice during SSR, but this only renders
 * inside the account menu, which exists after the owner opens it (a post-hydration
 * action), so the sliding pill's starting position is always correct with no
 * hydration mismatch to guard against.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const activeIndex = THEME_OPTIONS.findIndex(
    (option) => option.value === normalizeTheme(theme),
  );

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="relative flex rounded-lg bg-white/5 p-1"
    >
      {/* Sliding pill behind the active segment. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-white/12 shadow-sm ring-1 ring-white/10 transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.value === normalizeTheme(theme);

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-subheading text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400",
              selected ?
                "text-on-secondary-500"
              : "text-on-secondary-500/55 hover:text-on-secondary-500/80",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The selectable themes, in display order, each mapped to its next-themes value. */
const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

/** Narrow next-themes' `string | undefined` theme to a known option value. */
function normalizeTheme(
  theme: string | undefined,
): (typeof THEME_OPTIONS)[number]["value"] {
  return theme === "light" || theme === "dark" ? theme : "system";
}
