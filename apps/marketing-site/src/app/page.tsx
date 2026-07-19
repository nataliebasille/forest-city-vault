import Image from "next/image";
import { ArrowUpRightIcon, MapPinIcon } from "@/components/icons";
import { HeroSearch } from "@/components/hero/HeroSearch";

const MAP_URL =
  "https://maps.google.com/?q=2808+Church+Ave,+Cleveland,+OH+44113";

export default function Home() {
  return (
    <main className="vault-paper">
      <header className="sticky top-0 z-40 border-b border-surface-950/10 bg-surface-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:h-20 md:px-10">
          <a href="#top" className="flex items-center gap-3">
            <Image
              src="/branding/fcv-monogram.png"
              alt="Forest City Vault logo"
              width={1296}
              height={684}
              priority
              className="h-auto max-h-10 w-16 md:hidden"
            />
            <Image
              src="/branding/primary logo no tag.svg"
              alt="Forest City Vault logo"
              width={160}
              height={90}
              priority
              className="hidden h-auto max-h-12 w-28 md:inline-block md:w-32"
            />
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#discover"
              className="nav-link font-subheading text-sm font-medium text-secondary-500"
            >
              <span className="nav-underline">Browse</span>
            </a>
            <a
              href="#makers"
              className="nav-link font-subheading text-sm font-medium text-secondary-500"
            >
              <span className="nav-underline">Vendors</span>
            </a>
            <a
              href={MAP_URL}
              target="_blank"
              rel="noreferrer"
              className="nav-link font-subheading text-sm font-medium text-secondary-500"
            >
              <span className="nav-underline">Visit</span>
            </a>
            <a
              href="#makers"
              className="btn btn-outline/primary font-subheading text-sm font-semibold"
            >
              Become a vendor
            </a>
          </nav>
          <a
            href="#makers"
            className="btn btn-outline/primary btn-size-sm font-subheading font-semibold md:hidden"
          >
            Become a vendor
          </a>
        </div>
      </header>

      <section
        id="top"
        className="relative overflow-hidden bg-gradient-to-b from-accent-50/45 via-surface-50 to-surface-50"
      >
        <div className="relative mx-auto grid w-full max-w-7xl items-stretch gap-10 px-6 py-14 md:px-10 md:py-16 lg:min-h-[640px] lg:grid-cols-2 lg:gap-14 lg:py-20">
          <div className="flex flex-col justify-center gap-6 lg:gap-7">
            <p className="flex items-center gap-3 font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              <span className="h-px w-8 bg-primary-500" aria-hidden="true" />A
              curated marketplace in Ohio City
            </p>
            <h1 className="font-heading text-4xl leading-[1.05] text-secondary-500 sm:text-5xl lg:text-6xl xl:text-7xl">
              Find your next{" "}
              <span className="italic text-primary-500">favorite</span> thing.
            </h1>
            <p className="max-w-xl text-lg/8 text-on-surface-50/80">
              Explore locally made art, vintage finds, apparel, home goods,
              gifts, and one-of-a-kind pieces from independent Cleveland
              vendors.
            </p>

            <HeroSearch />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="#makers"
                className="nav-link inline-flex items-center gap-2 font-subheading text-sm font-semibold text-secondary-500"
              >
                <span className="nav-underline">Browse all vendors</span>
                <ArrowUpRightIcon className="h-4 w-4 text-primary-500" />
              </a>
              <a
                href={MAP_URL}
                target="_blank"
                rel="noreferrer"
                className="nav-link inline-flex items-center gap-2 font-subheading text-sm font-semibold text-secondary-500"
              >
                <span className="nav-underline">Plan your visit</span>
                <ArrowUpRightIcon className="h-4 w-4 text-primary-500" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-surface-950/10 pt-5 text-sm text-secondary-500/80">
              <a
                href={MAP_URL}
                target="_blank"
                rel="noreferrer"
                className="nav-link inline-flex items-center gap-2"
              >
                <MapPinIcon className="h-4 w-4 text-primary-500" />
                <span className="nav-underline">Ohio City, Cleveland</span>
              </a>
              <span
                className="hidden h-1 w-1 rounded-full bg-secondary-500/40 sm:inline-block"
                aria-hidden="true"
              />
              <span>Locally made · Independently owned</span>
            </div>
          </div>

          <div className="relative h-full">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-surface-950/10 shadow-[0_35px_80px_-45px_rgba(76,70,57,0.7)] sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[32rem]">
              <Image
                src="/images/fvc-hero.jpeg"
                alt="The Forest City Vault marketplace shelves filled with locally made goods in Ohio City, Cleveland"
                fill
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover object-center"
              />
            </div>
            <div className="absolute top-4 right-4 rounded-full border border-surface-950/10 bg-surface-50/90 px-4 py-1.5 font-subheading text-[0.7rem] font-semibold tracking-[0.18em] text-secondary-500 uppercase shadow-sm backdrop-blur">
              New finds weekly
            </div>
            <div className="absolute bottom-4 left-4 max-w-[15rem] rounded-2xl border border-surface-950/10 bg-surface-50/95 px-4 py-3 shadow-lg backdrop-blur">
              <p className="font-subheading text-[0.65rem] font-semibold tracking-[0.22em] text-primary-500 uppercase">
                Inside the vault
              </p>
              <p className="font-heading text-lg text-secondary-500">
                Made locally.
                <br />
                Found here.
              </p>
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
              Browse slowly, discover intentionally, and find locally made
              pieces worth the price because they carry craft and character.
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
              The vault is a feeling: a collection of things worth finding.
              Subtle intrigue, never a literal theme.
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
              Join a collaborative marketplace where you can sell, collaborate,
              and grow as part of something shared.
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
