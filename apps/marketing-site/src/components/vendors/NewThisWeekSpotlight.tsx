"use client";

import { useEffect, useState } from "react";
import { FeaturedVendorCard, type FeaturedVendor } from "./FeaturedVendorCard";

const ROTATE_INTERVAL_MS = 5000;

export function NewThisWeekSpotlight({
  vendors,
}: {
  vendors: FeaturedVendor[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const safeIndex = index % vendors.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (vendors.length <= 1 || paused || reducedMotion) {
      return;
    }

    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % vendors.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [vendors.length, paused, reducedMotion]);

  if (vendors.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-4 lg:h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
          New this week
        </p>
        {vendors.length > 1 ?
          <div className="-mr-1 flex items-center">
            {vendors.map((vendor, dotIndex) => {
              const isActive = dotIndex === safeIndex;
              return (
                <button
                  key={vendor.slug}
                  type="button"
                  aria-label={`Show ${vendor.name}`}
                  aria-current={isActive}
                  onClick={() => setIndex(dotIndex)}
                  className="group/dot inline-flex items-center justify-center p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                >
                  <span
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      isActive ? "w-5 bg-primary-500" : (
                        "w-1.5 bg-surface-500/40 group-hover/dot:bg-surface-500/70"
                      )
                    }`}
                  />
                </button>
              );
            })}
          </div>
        : null}
      </div>

      <div
        className="group w-full max-w-md overflow-hidden lg:max-w-none lg:min-h-0 lg:flex-1"
        aria-live="polite"
        aria-atomic="true"
      >
        <div
          className={`flex lg:h-full ${
            reducedMotion ? "" : "transition-transform duration-500 ease-in-out"
          }`}
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {vendors.map((vendor, cardIndex) => {
            const isActive = cardIndex === safeIndex;
            return (
              <div
                key={vendor.slug}
                inert={!isActive}
                className="w-full shrink-0 lg:h-full"
              >
                <FeaturedVendorCard vendor={vendor} fillHeight />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
