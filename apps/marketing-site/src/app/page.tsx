import Image from "next/image";
import { MapPinIcon } from "@/components/icons";

export default function Home() {
  return (
    <main className="vault-paper">
      <header className="sticky top-0 z-40 border-b border-surface-600/20 bg-surface-50/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:h-20 tablet:px-10">
          <a href="#top" className="flex items-center gap-3">
            <Image
              src="/branding/fcv-monogram.png"
              alt="Forest City Vault logo"
              width={1296}
              height={684}
              className="h-auto max-h-10 w-16 md:hidden"
            />
            <Image
              src="/branding/primary logo no tag.svg"
              alt="Forest City Vault logo"
              width={160}
              height={90}
              className="hidden h-auto max-h-12 w-28 md:inline-block md:w-32"
            />
            <span className="font-subheading hidden text-xs tracking-[0.2em] text-secondary-500 uppercase md:inline">
              A community marketplace
            </span>
          </a>
          <nav className="flex items-center gap-2">
            <a
              href="https://maps.google.com/?q=2808+Church+Ave,+Cleveland,+OH+44113"
              target="_blank"
              rel="noreferrer"
              className="nav-link text-sm font-medium text-secondary-500"
            >
              <span className="inline-flex items-center gap-2">
                <MapPinIcon className="h-4 w-4" />
                <span className="nav-underline">
                  Ohio City, Cleveland, Ohio
                </span>
              </span>
            </a>
          </nav>
        </div>
      </header>

      <section
        id="top"
        className="relative min-h-[calc(100svh-4rem)] overflow-hidden text-surface-50 md:min-h-[calc(100svh-5rem)]"
      >
        <Image
          src="/images/fvc-hero.jpeg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[32%_65%] md:object-center"
        />
        <div className="absolute inset-0 bg-secondary-500/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/26 via-secondary-500/70 to-secondary-500/88 md:bg-gradient-to-r" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_45%,rgba(255,255,255,0.2),transparent_40%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_23%_76%,rgba(255,255,255,0.34),transparent_38%)]" />
        <div className="absolute left-0 top-0 h-full w-full opacity-25">
          <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-primary-500 blur-3xl" />
          <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-accent-500 blur-3xl" />
        </div>
        <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl gap-1 px-4 py-6 md:min-h-[calc(100svh-5rem)] md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-10 md:px-10 md:py-12 desktop:py-20">
          <div className="flex items-center justify-center md:justify-start">
            <Image
              src="/branding/primary logo w tag.svg"
              alt="Forest City Vault with tagline"
              width={640}
              height={360}
              priority
              className="mx-auto h-auto w-full max-w-[26rem] drop-shadow-[0_2px_2px_rgba(255,255,255,0.35)] drop-shadow-[0_14px_30px_rgba(0,0,0,0.72)] md:max-w-[28rem] lg:max-w-none"
            />
          </div>
          <div className="space-y-4 md:space-y-6">
            <p className="font-subheading text-xs tracking-[0.28em] text-accent-50 uppercase">
              Forest City Vault: a community marketplace
            </p>
            <h1 className="font-heading text-4xl leading-tight tablet:text-6xl desktop:text-7xl">
              A place to discover.
            </h1>
            <p className="max-w-xl text-base/8 tracking-wide text-surface-50/90 tablet:text-xl/9">
              Forest City Vault is a community-driven marketplace where local makers sell,
              collaborate, and grow while customers discover goods they will not find
              anywhere else.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#discover" className="btn btn-solid/primary">
                See what&apos;s inside
              </a>
              <a href="#makers" className="btn btn-outline/surface">
                Become a vendor
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="discover" className="bg-surface-50 py-16 tablet:py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 tablet:px-10 desktop:grid-cols-2">
          <div id="customers" className="space-y-5">
            <p className="font-subheading text-xs tracking-[0.28em] text-primary-500 uppercase">
              For customers
            </p>
            <h2 className="font-heading text-4xl leading-tight text-secondary-500 tablet:text-5xl">
              Explore first. Buy second.
            </h2>
            <p className="text-lg/8 text-on-surface-50/80">
              Browse slowly, discover intentionally, and find locally made pieces worth the
              price because they carry craft and character.
            </p>
            <ul className="space-y-2 text-base/7 text-on-surface-50/75">
              <li>Inviting and unhurried</li>
              <li>Rewarding the deeper you look</li>
              <li>Different from typical retail</li>
            </ul>
          </div>
          <div className="space-y-5 border-t border-surface-600/20 pt-8 desktop:border-l desktop:border-t-0 desktop:pl-10 desktop:pt-0">
            <p className="font-subheading text-xs tracking-[0.28em] text-secondary-500 uppercase">
              The role of “vault”
            </p>
            <h2 className="font-heading text-4xl leading-tight text-secondary-500 tablet:text-5xl">
              Hidden in plain sight.
            </h2>
            <p className="text-lg/8 text-on-surface-50/80">
              The vault is a feeling: a collection of things worth finding. Subtle intrigue,
              never a literal theme.
            </p>
            <div className="space-y-2">
              <p className="rounded-lg bg-primary-50/65 px-4 py-3 text-sm text-on-primary-50">
                “See what&apos;s inside.”
              </p>
              <p className="rounded-lg border border-surface-600/20 px-4 py-3 text-sm text-on-surface-50">
                “Just added to the vault.”
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-primary-500 py-14 text-surface-50 tablet:py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 tablet:grid-cols-3 tablet:px-10">
          <article>
            <p className="font-subheading text-xs tracking-[0.24em] text-accent-50 uppercase">
              01 Curate
            </p>
            <h3 className="font-heading mt-2 text-3xl">Intentional mix</h3>
            <p className="mt-2 text-base/7 text-surface-50/90">
              Makers selected for quality, fit, and shared values.
            </p>
          </article>
          <article>
            <p className="font-subheading text-xs tracking-[0.24em] text-accent-50 uppercase">
              02 Connect
            </p>
            <h3 className="font-heading mt-2 text-3xl">Shared energy</h3>
            <p className="mt-2 text-base/7 text-surface-50/90">
              Community over competition for both vendors and customers.
            </p>
          </article>
          <article>
            <p className="font-subheading text-xs tracking-[0.24em] text-accent-50 uppercase">
              03 Evolve
            </p>
            <h3 className="font-heading mt-2 text-3xl">Always fresh</h3>
            <p className="mt-2 text-base/7 text-surface-50/90">
              New drops and discoveries keep every visit different.
            </p>
          </article>
        </div>
      </section>

      <section id="makers" className="bg-accent-50 py-16 tablet:py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 tablet:px-10 desktop:grid-cols-[auto_1fr] desktop:items-center">
          <Image
            src="/branding/secondary logo.png"
            alt="FCV secondary logo"
            width={340}
            height={240}
            className="h-auto w-full max-w-[18rem]"
          />
          <div className="space-y-5">
            <p className="font-subheading text-xs tracking-[0.28em] text-primary-500 uppercase">
              For makers
            </p>
            <h2 className="font-heading text-4xl leading-tight text-secondary-500 tablet:text-5xl">
              Low ego, high ownership.
            </h2>
            <p className="max-w-2xl text-lg/8 text-on-surface-50/80">
              Join a collaborative marketplace where you can sell, collaborate, and grow as
              part of something shared.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#" className="btn btn-solid/primary">
                Apply as a maker
              </a>
              <a href="#" className="btn btn-ghost/surface">
                Plan a visit
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
