import { publicPage } from "@/lib/auth";
import { Effect } from "effect";
import Image from "next/image";
import { LoginForm } from "./login-form";

export default publicPage("login", () =>
  Effect.succeed(
    <main className="flex flex-1 flex-col md:grid md:grid-cols-2">
      {/* Brand story panel — tablet/desktop only. On mobile the form column
          takes over full-bleed with a brand-brown background instead. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-light-surface-950 p-12 text-on-light-surface-950 md:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(190,153,109,0.35),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(175,95,29,0.35),transparent_45%)] opacity-70"
        />
        <Image
          src="/branding/primary logo no tag reverse.png"
          alt="Forest City Vault logo"
          width={994}
          height={768}
          priority
          className="relative h-auto w-36"
        />
        <div className="relative flex flex-col gap-4">
          <h2 className="font-heading text-4xl leading-tight font-semibold">
            The vault, kept in order.
          </h2>
          <p className="font-body max-w-sm text-lg/8 text-on-light-surface-950/80">
            Internal administration for the Forest City Vault community
            marketplace — vendors, listings, and members, all in one place.
          </p>
        </div>
        <p className="font-subheading relative text-xs tracking-[0.28em] text-on-light-surface-950/60 uppercase">
          Invite-only · Secured access
        </p>
      </aside>

      <LoginForm />
    </main>,
  ),
);
