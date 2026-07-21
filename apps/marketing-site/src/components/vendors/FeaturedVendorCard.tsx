import Image from "next/image";
import { cn } from "@/lib/cn";
import { ArrowRightIcon } from "@/components/icons";

export type FeaturedVendor = {
  name: string;
  slug: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  // TODO(temporary-image): `imagePosition` only exists to vary the crop while the
  // marketplace has a single shared photo. Remove once real vendor photography
  // is available and each vendor has its own `imageSrc`.
  imagePosition?: string;
  categories: string[];
  badge?: string;
  // Marks vendors surfaced in the rotating "New this week" spotlight.
  isNew?: boolean;
};

export function FeaturedVendorCard({
  vendor,
  fillHeight = false,
}: {
  vendor: FeaturedVendor;
  // When true, the image stretches to fill leftover vertical space instead of
  // using a fixed 4/3 aspect ratio. Used by the spotlight so its card height
  // matches the featured vendor column rather than scaling with its width.
  fillHeight?: boolean;
}) {
  return (
    <article className="flex h-full snap-start flex-col overflow-hidden rounded-xl border border-surface-500/30 bg-surface-50">
      <div
        className={cn(
          "relative w-full overflow-hidden",
          fillHeight ?
            "aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1"
          : "aspect-[4/3]",
        )}
      >
        <Image
          src={vendor.imageSrc}
          alt={vendor.imageAlt}
          fill
          sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 30vw, (min-width: 768px) 45vw, 85vw"
          style={{ objectPosition: vendor.imagePosition }}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {vendor.badge ?
          <span className="absolute top-3 left-3 rounded-md bg-primary-500 px-2.5 py-1 font-subheading text-[0.65rem] font-semibold tracking-[0.12em] text-surface-50 uppercase shadow-sm">
            {vendor.badge}
          </span>
        : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-heading text-xl text-secondary-500">
          {vendor.name}
        </h3>
        <p className="font-body text-sm/6 text-on-surface-50/80">
          {vendor.description}
        </p>

        <ul className="flex flex-wrap gap-2">
          {vendor.categories.map((category) => (
            <li
              key={category}
              className="rounded-md border border-surface-500/40 px-2.5 py-1 font-subheading text-xs text-secondary-500/80"
            >
              {category}
            </li>
          ))}
        </ul>

        {/* TODO(vendor-routes): Link to `/vendors/${vendor.slug}` once vendor
            profile routes exist. No route exists yet, so this is a non-navigating
            button to avoid a dead link. */}
        <button
          type="button"
          className="group/link mt-auto inline-flex w-fit items-center gap-1.5 pt-1 font-subheading text-sm font-semibold text-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <span className="nav-underline">View their collection</span>
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/link:translate-x-0.5" />
        </button>
      </div>
    </article>
  );
}
