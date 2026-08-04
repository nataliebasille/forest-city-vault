import type { IconProps } from "./icon-props";

export function SignOutIcon({ className }: IconProps) {
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
      <path d="M15 12H4m0 0l3.5-3.5M4 12l3.5 3.5" />
      <path d="M11 5V4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-1" />
    </svg>
  );
}
