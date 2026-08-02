import { publicPage } from "@/lib/auth";
import { Effect } from "effect";
import Image from "next/image";

export default publicPage("login", () =>
  Effect.succeed(
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <Image
          src="/branding/primary logo no tag.svg"
          alt="Forest City Vault logo"
          width={994}
          height={768}
          priority
          className="h-auto w-40 md:w-48"
        />

        <div className="flex flex-col items-center gap-4">
          <span className="font-subheading text-xs font-semibold uppercase tracking-[0.2em] text-primary-500">
            Admin Portal
          </span>
          <h1 className="font-heading text-3xl font-semibold leading-tight text-ink md:text-4xl">
            Sign in
          </h1>
          <p className="font-body max-w-sm text-lg leading-8 text-on-surface-50/80">
            Access to the Forest City Vault admin portal is invite-only. A
            passwordless sign-in link will be sent to owners here.
          </p>
        </div>
      </div>
    </main>,
  ),
);
