import type { Metadata } from "next";
import { ArrowRightIcon } from "@/components/icons";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { BecomeVendorForm } from "@/components/vendors/BecomeVendorForm";
import { COMMISSION_TIERS } from "@/lib/vendors/commission";

export const metadata: Metadata = {
  title: "Become a vendor · Forest City Vault",
  description:
    "Sell your work at Forest City Vault, a curated consignment marketplace in Ohio City, Cleveland. Keep 60% of every sale, or 70% when you work the store monthly. Apply to join.",
};

const PERKS = [
  {
    title: "Prime foot traffic",
    body: "A storefront in the heart of Ohio City, Cleveland.",
  },
  {
    title: "We run checkout",
    body: "Payments, receipts, and payouts are handled for you.",
  },
  {
    title: "Curated community",
    body: "Sell alongside a hand-picked group of local makers.",
  },
  {
    title: "Featured online",
    body: "Your shop appears in our public vendor directory.",
  },
] as const;

export default function BecomeVendorPage() {
  return (
    <main className="vault-paper min-h-full">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-50/45 via-accent-50/20 to-accent-50/35">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 md:px-10 md:py-24">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              <span className="h-px w-8 bg-primary-500" aria-hidden="true" />
              A curated marketplace in Ohio City
            </p>
            <h1 className="mt-5 font-heading text-4xl leading-[1.05] text-secondary-500 sm:text-5xl lg:text-6xl">
              Sell your work at the{" "}
              <span className="italic text-primary-500">Vault</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-lg/8 text-on-surface-50/80">
              Join a community of independent Cleveland makers. We handle the
              storefront, the foot traffic, and checkout, so you focus on your
              craft.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#apply"
                className="btn btn-solid/primary inline-flex min-h-11 items-center justify-center gap-2 font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                Apply to become a vendor
                <ArrowRightIcon className="h-4 w-4" />
              </a>
              <a
                href="#how-it-works"
                className="nav-link inline-flex items-center gap-2 font-subheading text-sm font-semibold text-secondary-500"
              >
                <span className="nav-underline">See the split</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Commission / consignment structure */}
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
        className="border-t border-surface-500/25 bg-surface-50 py-16 md:py-20"
      >
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
          <div className="max-w-2xl space-y-3">
            <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              How it works
            </p>
            <h2
              id="how-it-works-heading"
              className="font-heading text-3xl leading-tight text-secondary-500 sm:text-4xl lg:text-5xl"
            >
              A simple consignment split.
            </h2>
            <p className="text-lg/8 text-on-surface-50/80">
              Forest City Vault is a consignment store, so there&apos;s no
              upfront booth rent. You&apos;re paid out on the items that sell,
              and you keep the majority of every sale.
            </p>
            <p className="text-lg/8 text-on-surface-50/80">
              Every vendor starts on the standard 60/40 split, and you don&apos;t
              choose anything when you apply. The higher split is entirely
              optional, and you can opt in whenever it suits you.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {COMMISSION_TIERS.map((tier) => (
              <div
                key={tier.label}
                className={
                  tier.featured
                    ? "relative rounded-3xl border-2 border-primary-500 bg-gradient-to-b from-accent-50/50 to-surface-50 p-7 shadow-[0_30px_70px_-45px_rgba(175,95,29,0.65)] md:p-8"
                    : "relative rounded-3xl border border-surface-500/40 bg-surface-50 p-7 md:p-8"
                }
              >
                {tier.featured ? (
                  <span className="absolute top-6 right-6 rounded-full bg-primary-500 px-3 py-1 font-subheading text-[0.62rem] font-bold tracking-[0.14em] text-surface-50 uppercase">
                    Optional boost
                  </span>
                ) : null}
                <p className="font-subheading text-xs font-bold tracking-[0.22em] text-primary-500 uppercase">
                  {tier.label}
                </p>
                <p className="mt-4 font-heading text-5xl text-secondary-500">
                  <span className="text-primary-500">{tier.vendorShare}</span> /{" "}
                  {tier.storeShare}
                </p>
                <p className="mt-1 font-subheading text-sm font-semibold text-secondary-500/75">
                  You keep {tier.vendorShare}% of every sale
                </p>
                <p className="mt-4 text-base/7 text-on-surface-50/85">
                  {tier.description}
                </p>
                {tier.requirement ? (
                  <p className="mt-4 inline-flex items-center gap-2 font-subheading text-sm font-semibold text-primary-500">
                    <span aria-hidden="true">★</span>
                    Optional: {tier.requirement.charAt(0).toLowerCase() + tier.requirement.slice(1)}
                  </p>
                ) : null}
                {tier.note ? (
                  <p className="mt-4 border-t border-surface-500/25 pt-4 text-sm text-secondary-500/70">
                    {tier.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <p className="mt-6 text-base text-secondary-500/70 italic">
            Consignment means you only pay when you sell, with no monthly rent
            and no risk. Applying doesn&apos;t commit you to anything; we&apos;ll
            sort out the details together.
          </p>
        </div>
      </section>

      {/* Perks */}
      <section className="border-t border-surface-500/25 bg-gradient-to-b from-surface-50 to-accent-50/25 py-14">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map((perk) => (
              <li
                key={perk.title}
                className="rounded-2xl border border-surface-500/35 bg-surface-50 p-5"
              >
                <h3 className="font-subheading text-base font-bold text-secondary-500">
                  {perk.title}
                </h3>
                <p className="mt-1.5 text-sm/6 text-on-surface-50/75">
                  {perk.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Application form */}
      <section
        id="apply"
        aria-labelledby="apply-heading"
        className="scroll-mt-24 border-t border-surface-500/25 bg-surface-50 py-16 md:py-20"
      >
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
          <div className="max-w-2xl space-y-3">
            <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              Apply
            </p>
            <h2
              id="apply-heading"
              className="font-heading text-3xl leading-tight text-secondary-500 sm:text-4xl lg:text-5xl"
            >
              Tell us about your work.
            </h2>
            <p className="text-lg/8 text-on-surface-50/80">
              Fill out the form and our team will be in touch about space,
              timing, and next steps. No split to choose here and no commitment.
              Just tell us about your work.
            </p>
          </div>

          <BecomeVendorForm />
        </div>
      </section>
    </main>
  );
}
