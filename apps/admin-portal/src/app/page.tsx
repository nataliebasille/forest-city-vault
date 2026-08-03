import { CurrentUser } from "@/lib/auth";
import { privatePage } from "@/runtime";
import { Effect } from "effect";
import Image from "next/image";

// The auth gate reads request cookies and the database per request, so this page
// must render dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

export default privatePage("admin-home", () =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;

    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8">
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
            <h1 className="font-heading text-4xl font-semibold leading-tight text-ink md:text-5xl">
              Welcome to the vault
            </h1>
            <p className="font-body max-w-md text-lg leading-8 text-on-surface-50/80">
              Signed in as{" "}
              <span className="font-semibold text-ink">{user.email}</span>.
              Internal administration for the Forest City Vault community
              marketplace.
            </p>
          </div>
        </div>
      </main>
    );
  }),
);
