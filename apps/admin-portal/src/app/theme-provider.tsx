"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/**
 * Client boundary for next-themes. It owns the theme choice (Light/Dark/System),
 * persists it to `localStorage`, follows the OS when "System" is selected, and
 * injects the pre-paint script that stamps the resolved theme onto `<html>`
 * before first paint so there's no flash of the wrong scheme.
 *
 * The resolved theme is written as `data-theme="light" | "dark"` — never
 * `"system"`, since next-themes resolves that to the OS value — which is exactly
 * what `globals.css` keys its dark rules off of. `enableColorScheme` also sets
 * the CSS `color-scheme` property per resolved theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      enableColorScheme
    >
      {children}
    </NextThemeProvider>
  );
}
