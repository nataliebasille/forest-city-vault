import { twMerge } from "tailwind-merge";

type ClassValue = string | number | null | false | undefined;

/**
 * Merge Tailwind class names, resolving conflicts so that later utilities win
 * (e.g. `cn("px-4", condition && "px-6")` yields `px-6`). Falsy values are
 * dropped, which makes conditional composition read cleanly.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
