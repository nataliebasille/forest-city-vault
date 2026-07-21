"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { FeaturedVendorCard, type FeaturedVendor } from "./FeaturedVendorCard";

const ROTATE_INTERVAL_MS = 5000;
// Minimum horizontal travel (px) before a touch gesture counts as a swipe.
const SWIPE_THRESHOLD_PX = 40;

export function RotatingVendorCarousel({
  vendors,
  label,
  fillHeight = false,
  className = "",
}: {
  vendors: FeaturedVendor[];
  label: string;
  // When true, cards stretch to fill leftover vertical space so the carousel
  // height matches an adjacent column instead of scaling with card width.
  fillHeight?: boolean;
  // Extra classes for the root wrapper (e.g. responsive visibility or height).
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const deltaRef = useRef({ x: 0, y: 0 });

  const safeIndex = vendors.length > 0 ? index % vendors.length : 0;

  const goTo = (next: number) => {
    setIndex((next + vendors.length) % vendors.length);
  };

  // Swipe handling via Pointer Events. Scroll vs. swipe disambiguation is left
  // to the `touch-pan-y` CSS (touch-action: pan-y): the browser keeps vertical
  // scrolling and hands horizontal drags to us. For touch pointers the events
  // are implicitly captured to the target, so move/up reliably fire here.
  const handlePointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary) {
      return;
    }
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    deltaRef.current = { x: 0, y: 0 };
    setPaused(true);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const startPointer = pointerRef.current;
    if (startPointer === null || event.pointerId !== startPointer.id) {
      return;
    }
    deltaRef.current = {
      x: event.clientX - startPointer.x,
      y: event.clientY - startPointer.y,
    };
  };

  const handlePointerEnd = () => {
    if (pointerRef.current === null) {
      return;
    }
    const { x: deltaX, y: deltaY } = deltaRef.current;
    // Only act on clearly horizontal gestures so vertical scrolling still works.
    if (
      vendors.length > 1 &&
      Math.abs(deltaX) >= SWIPE_THRESHOLD_PX &&
      Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      // Swipe left (negative delta) advances; swipe right goes back.
      goTo(safeIndex + (deltaX < 0 ? 1 : -1));
    }
    pointerRef.current = null;
    deltaRef.current = { x: 0, y: 0 };
    setPaused(false);
  };

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
      className={cn("flex flex-col gap-4", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
          {label}
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
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-200",
                      isActive ?
                        "w-5 bg-primary-500"
                      : "w-1.5 bg-surface-500/40 group-hover/dot:bg-surface-500/70",
                    )}
                  />
                </button>
              );
            })}
          </div>
        : null}
      </div>

      <div
        className={cn(
          "group w-full touch-pan-y overflow-hidden",
          fillHeight ?
            "max-w-md lg:max-w-none lg:min-h-0 lg:flex-1"
          : "max-w-md",
        )}
        aria-live="polite"
        aria-atomic="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      >
        <div
          className={cn(
            "flex",
            fillHeight && "lg:h-full",
            !reducedMotion && "transition-transform duration-500 ease-in-out",
          )}
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {vendors.map((vendor, cardIndex) => {
            const isActive = cardIndex === safeIndex;
            return (
              <div
                key={vendor.slug}
                inert={!isActive}
                className={cn("w-full shrink-0", fillHeight && "lg:h-full")}
              >
                <FeaturedVendorCard vendor={vendor} fillHeight={fillHeight} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
