import Image from "next/image";

export default function Home() {
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
            Internal administration for the Forest City Vault community
            marketplace. Start building by editing{" "}
            <code className="rounded bg-surface-500/15 px-1.5 py-0.5 font-mono text-sm text-ink">
              src/app/page.tsx
            </code>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
