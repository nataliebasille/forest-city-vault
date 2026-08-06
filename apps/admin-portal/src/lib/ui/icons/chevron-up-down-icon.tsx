import type { IconProps } from "./icon-props";

export function ChevronUpDownIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7 9 5-5 5 5M17 15l-5 5-5-5" />
    </svg>
  );
}
