import Image from "next/image";
import { ArrowUpRightIcon, MapPinIcon } from "@/components/icons";
import { HeroSearch } from "@/components/hero/HeroSearch";
import { MobileNav } from "@/components/nav/MobileNav";
import { FeaturedVendors } from "@/components/vendors/FeaturedVendors";

const MAP_URL =
  "https://maps.google.com/?q=2808+Church+Ave,+Cleveland,+OH+44113";

export default function Home() {
  return (
    <main className="vault-paper">
      <header className="sticky top-0 z-40 border-b border-surface-50/10 bg-secondary-500/95 text-surface-50 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:h-20 md:px-10">
          <a href="#top" className="flex items-center gap-3">
            <Image
              src="/branding/fcv-monogram reverse.png"
              alt="Forest City Vault logo"
              width={1152}
              height={768}
              priority
              className="h-auto max-h-10 w-16 md:hidden"
            />
            <Image
              src="/branding/primary logo no tag reverse.png"
              alt="Forest City Vault logo"
              width={994}
              height={768}
              priority
              className="hidden h-auto max-h-12 w-28 md:inline-block md:w-32"
            />
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#vendors"
              className="nav-link font-subheading text-sm font-medium text-surface-50"
            >
              <span className="nav-underline">Browse</span>
            </a>
            <a
              href="#vendors"
              className="nav-link font-subheading text-sm font-medium text-surface-50"
            >
              <span className="nav-underline">Vendors</span>
            </a>
            <a
              href={MAP_URL}
              target="_blank"
              rel="noreferrer"
              className="nav-link font-subheading text-sm font-medium text-surface-50"
            >
              <span className="nav-underline">Visit</span>
            </a>
            <a
              href="#vendors"
              className="btn btn-outline/primary font-subheading text-sm font-semibold text-current"
            >
              Become a vendor
            </a>
          </nav>
          <MobileNav mapUrl={MAP_URL} />
        </div>
      </header>

      <section
        id="top"
        className="relative overflow-hidden bg-gradient-to-b from-accent-50/45 via-accent-50/20 to-accent-50/35"
      >
        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 px-6 pt-8 pb-10 md:gap-10 md:px-10 md:py-16 lg:min-h-[640px] lg:grid-cols-2 lg:gap-14 lg:py-20">
          <div className="flex min-w-0 flex-col justify-center gap-4 md:gap-6 lg:gap-7">
            <p className="hidden items-center gap-3 font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase md:flex">
              <span className="h-px w-8 bg-primary-500" aria-hidden="true" />A
              curated marketplace in Ohio City
            </p>
            <h1 className="font-heading text-4xl leading-[1.05] text-secondary-500 sm:text-5xl lg:text-6xl xl:text-7xl">
              Find your next{" "}
              <span className="italic text-primary-500">favorite</span> thing.
            </h1>
            <p className="max-w-xl text-lg/8 text-on-surface-50/80 md:hidden">
              Discover vintage, art, apparel, home goods, and one-of-a-kind
              pieces from Cleveland vendors.
            </p>
            <p className="hidden max-w-xl text-lg/8 text-on-surface-50/80 md:block">
              Explore locally made art, vintage finds, apparel, home goods,
              gifts, and one-of-a-kind pieces from independent Cleveland
              vendors.
            </p>

            <HeroSearch />

            <div className="hidden flex-wrap items-center gap-x-6 gap-y-3 md:flex">
              <a
                href="#vendors"
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

            <div className="hidden flex-wrap items-center gap-x-5 gap-y-2 border-t border-surface-950/10 pt-5 text-sm text-secondary-500/80 md:flex">
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

          <div className="relative h-full min-w-0">
            <div className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-surface-950/10 sm:aspect-[16/10] md:rounded-3xl md:shadow-[0_35px_80px_-45px_rgba(76,70,57,0.7)] lg:aspect-auto lg:h-full lg:min-h-[32rem]">
              <Image
                src="/images/fvc-hero.jpeg"
                alt="The Forest City Vault marketplace shelves filled with locally made goods in Ohio City, Cleveland"
                fill
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover object-center"
              />
              <div className="absolute top-4 right-4 rounded-full border border-surface-950/10 bg-surface-50/90 px-4 py-1.5 font-subheading text-[0.7rem] font-semibold tracking-[0.18em] text-secondary-500 uppercase shadow-sm backdrop-blur">
                New finds weekly
              </div>
              <div className="absolute bottom-4 left-4 hidden max-w-[15rem] rounded-2xl border border-surface-950/10 bg-surface-50/95 px-4 py-3 shadow-lg backdrop-blur md:block">
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

            {/* Mobile-only quiet trust row beneath the image. */}
            <ul
              className="mt-4 flex flex-nowrap items-center gap-x-2 overflow-x-auto text-sm whitespace-nowrap text-secondary-500/80 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
              aria-label="Marketplace highlights"
            >
              <li className="inline-flex shrink-0 items-center gap-1.5">
                <MapPinIcon className="h-4 w-4 text-primary-500" />
                Ohio City, Cleveland
              </li>
              <li
                className="inline-block h-1 w-1 shrink-0 rounded-full bg-secondary-500/40"
                aria-hidden="true"
              />
              <li className="shrink-0">Support local makers</li>
              <li
                className="inline-block h-1 w-1 shrink-0 rounded-full bg-secondary-500/40"
                aria-hidden="true"
              />
              <li className="shrink-0">Curated with care</li>
            </ul>
          </div>
        </div>
      </section>

      <FeaturedVendors />
    </main>
  );
}
