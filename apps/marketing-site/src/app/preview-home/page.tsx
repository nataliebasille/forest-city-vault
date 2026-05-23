import Image from "next/image";
import Link from "next/link";

const featuredVendors = [
  {
    name: "Lake Erie Letterpress",
    category: "Prints + Paper",
    description:
      "Small-batch cards, neighborhood prints, and keepsake stationery.",
  },
  {
    name: "Market Hearth Pantry",
    category: "Consumables",
    description:
      "Local jams, spice blends, honey, sauces, and ready-to-gift treats.",
  },
  {
    name: "Studio Brick + Bloom",
    category: "Home + Art",
    description:
      "Ceramics, framed work, vessels, textiles, and warm shelf pieces.",
  },
];

const categories = [
  "Art",
  "Consumables",
  "Home Goods",
  "Jewelry",
  "Candles",
  "Vintage Finds",
  "Paper Goods",
  "Apparel",
];

const headingFont = {
  fontFamily: '"Silver Stone", "Cooper Black", Georgia, serif',
};

const subheadingFont = {
  fontFamily: '"Weston", "Courier New", monospace',
};

const bodyFont = {
  fontFamily: '"Cooper BT", Georgia, serif',
};

export default function PreviewHome() {
  return (
    <main className="min-h-screen bg-[#f7f3ec] text-[#17130f]" style={bodyFont}>
      <section className="relative min-h-[92vh] overflow-hidden bg-[#17130f] text-[#f7f3ec]">
        <Image
          src="/images/fvc-market-hero.png"
          alt="Warm artisan marketplace shelves with handmade goods"
          fill
          priority
          className="object-cover opacity-80"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,19,15,0.82)_0%,rgba(23,19,15,0.68)_38%,rgba(23,19,15,0.22)_72%,rgba(23,19,15,0.1)_100%)]" />

        <header className="relative z-10 flex items-center justify-between border-b border-[#f7f3ec]/25 bg-transparent px-5 py-4 sm:px-8 lg:px-12">
          <Link
            href="/preview-home"
            aria-label="Forest City Vault preview home"
            className="relative flex h-16 w-64 items-center justify-center px-8 sm:h-[72px] sm:w-72"
          >
            <Image
              src="/branding/element-box-header.svg"
              alt=""
              fill
              aria-hidden="true"
              className="object-fill drop-shadow-[0_14px_30px_rgba(23,19,15,0.35)]"
              sizes="288px"
            />
            <span
              className="relative z-10 flex items-baseline text-4xl font-black leading-none tracking-normal sm:text-[2.65rem]"
              style={headingFont}
            >
              <span className="text-[#4f493d]">FC</span>
              <span className="text-[#b35f1b]">V</span>
            </span>
          </Link>
          <nav
            className="hidden items-center gap-7 text-sm font-semibold uppercase tracking-[0.16em] text-[#f7f3ec]/90 md:flex"
            style={subheadingFont}
          >
            <Link href="/vendors">Vendors</Link>
            <Link href="/wares">Wares</Link>
            <Link href="/visit">Visit</Link>
          </nav>
          <Link
            href="/vendor-request"
            className="border border-[#f7f3ec] bg-[#f7f3ec] px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#4f493d] transition hover:bg-transparent hover:text-[#f7f3ec]"
            style={subheadingFont}
          >
            Join Us
          </Link>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(92vh-113px)] max-w-7xl items-center px-5 py-14 sm:px-8 lg:px-12">
          <div className="w-full max-w-5xl">
            <div className="mb-9 max-w-3xl border-y border-[#bd9566] bg-[#f7f3ec]/92 px-5 py-7 shadow-[0_18px_46px_rgba(23,19,15,0.3)] sm:px-8 sm:py-9">
              <div className="relative mx-auto aspect-[3.35/1] w-full max-w-[34rem] overflow-hidden">
                <Image
                  src="/branding/primary logo w tag.svg"
                  alt="Forest City Vault Community Marketplace"
                  fill
                  className="scale-[1.55] object-cover object-center"
                  priority
                  sizes="544px"
                />
              </div>
            </div>

            <div className="max-w-3xl">
              <p
                className="mb-5 max-w-fit border-y border-[#bd9566] py-2 text-sm font-bold uppercase tracking-[0.2em] text-[#e5c19a]"
                style={subheadingFont}
              >
                Ohio City, Cleveland
              </p>
              <h1
                className="max-w-4xl text-5xl font-black leading-[0.95] tracking-normal text-[#fffaf2] sm:text-6xl lg:text-7xl"
                style={headingFont}
              >
                Cleveland made, gathered under one roof.
              </h1>
              <p className="mt-7 max-w-2xl text-xl leading-8 text-[#f7f3ec]/90">
                Forest City Vault brings together 88 local vendors with art,
                pantry goods, gifts, vintage finds, home pieces, and the kind of
                discoveries that make a neighborhood market worth lingering in.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/wares"
                  className="bg-[#b35f1b] px-6 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#8f4915]"
                  style={subheadingFont}
                >
                  Explore The Vault
                </Link>
                <Link
                  href="/vendor-request"
                  className="border border-[#f7f3ec] px-6 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#f7f3ec] transition hover:bg-[#f7f3ec] hover:text-[#4f493d]"
                  style={subheadingFont}
                >
                  Become A Vendor
                </Link>
              </div>
            </div>
            <div className="mt-14 grid max-w-4xl gap-3 border-t border-[#f7f3ec]/25 pt-5 text-[#f7f3ec] sm:grid-cols-3">
              {["88 vendors", "Ohio City storefront", "Cleveland makers"].map(
                (item) => (
                  <p
                    key={item}
                    className="text-sm font-bold uppercase tracking-[0.18em] text-[#f7f3ec]/80"
                    style={subheadingFont}
                  >
                    {item}
                  </p>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#4f493d] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-0 px-5 sm:grid-cols-3 sm:px-8 lg:px-12">
          {[
            ["88", "current vendors"],
            ["Ohio City", "home base"],
            ["Cleveland", "maker network"],
          ].map(([number, label]) => (
            <div
              key={label}
              className="border-b border-[#4f493d] py-8 sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <p
                className="text-5xl font-black text-[#b35f1b]"
                style={headingFont}
              >
                {number}
              </p>
              <p
                className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-[#4f493d]"
                style={subheadingFont}
              >
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p
              className="text-sm font-black uppercase tracking-[0.18em] text-[#b35f1b]"
              style={subheadingFont}
            >
              Featured Vendors
            </p>
            <h2
              className="mt-4 text-4xl font-black leading-tight text-[#17130f] sm:text-5xl"
              style={headingFont}
            >
              A rotating look at what is inside.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-[#4f493d]">
            Use this area to spotlight the vendors you want customers to meet
            first. Each feature can later connect to a full vendor profile,
            product collection, or interview.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {featuredVendors.map((vendor, index) => (
            <article
              key={vendor.name}
              className="border border-[#4f493d] bg-[#fffaf2]"
            >
              <div className="flex aspect-[4/3] items-end bg-[#4f493d] p-5 text-[#f7f3ec]">
                <span
                  className="text-7xl font-black text-[#bd9566]"
                  style={headingFont}
                >
                  0{index + 1}
                </span>
              </div>
              <div className="p-6">
                <p
                  className="text-xs font-black uppercase tracking-[0.16em] text-[#b35f1b]"
                  style={subheadingFont}
                >
                  {vendor.category}
                </p>
                <h3
                  className="mt-3 text-2xl font-black text-[#17130f]"
                  style={headingFont}
                >
                  {vendor.name}
                </h3>
                <p className="mt-4 leading-7 text-[#4f493d]">
                  {vendor.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#4f493d] px-5 py-20 text-[#f7f3ec] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p
              className="text-sm font-black uppercase tracking-[0.18em] text-[#e5c19a]"
              style={subheadingFont}
            >
              Shop By Category
            </p>
            <h2
              className="mt-4 text-4xl font-black leading-tight sm:text-5xl"
              style={headingFont}
            >
              Come in for one thing. Leave with a Cleveland find.
            </h2>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Link
                href={`/wares?category=${encodeURIComponent(category)}`}
                key={category}
                className="border border-[#f7f3ec]/35 bg-[#f7f3ec]/8 px-5 py-5 text-xl font-black transition hover:border-[#bd9566] hover:bg-[#bd9566] hover:text-[#17130f]"
                style={subheadingFont}
              >
                {category}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#b35f1b] px-5 py-20 text-white sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p
              className="text-sm font-black uppercase tracking-[0.18em] text-[#ffe0bf]"
              style={subheadingFont}
            >
              For Cleveland Vendors
            </p>
            <h2
              className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-5xl"
              style={headingFont}
            >
              Bring your work into a market built around local discovery.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/88">
              The Vault is growing toward a citywide mix of artists, makers,
              curators, food producers, collectors, and small brands.
            </p>
          </div>
          <Link
            href="/vendor-request"
            className="border border-white bg-white px-7 py-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[#b35f1b] transition hover:bg-transparent hover:text-white"
            style={subheadingFont}
          >
            Request A Spot
          </Link>
        </div>
      </section>
    </main>
  );
}
