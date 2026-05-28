"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { safeImageSrc } from "@/lib/safe-image-src";

/** Portrait 3:4 slots like Fragrantica product cards: transparent fill, contain-fit bottle, soft inset hairline. */
export function BottleThumb({
  src,
  label,
  size = "md",
}: {
  src: string;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const widthClass =
    size === "sm" ? "w-11 sm:w-12" : size === "lg" ? "w-24 sm:w-32" : "w-[4.5rem] sm:w-[5.25rem]";
  const sizesAttr = size === "sm" ? "48px" : size === "lg" ? "(max-width:640px) 96px, 128px" : "84px";
  const safeSrc = safeImageSrc(src);

  useEffect(() => {
    setImgFailed(false);
  }, [safeSrc]);

  if (!safeSrc || imgFailed) {
    return (
      <div
        className={`relative flex aspect-[3/4] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-transparent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text)_9%,transparent)] ${widthClass}`}
        aria-hidden
      >
        <span className="text-sm font-medium text-[var(--muted)]/75 sm:text-base">
          {label.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-[3/4] shrink-0 overflow-hidden rounded-2xl bg-transparent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text)_9%,transparent)] ${widthClass}`}
    >
      <div className="absolute inset-2 sm:inset-2.5">
        <div className="relative h-full w-full">
          <Image
            src={safeSrc}
            alt={`${label} bottle`}
            fill
            sizes={sizesAttr}
            className="object-contain object-center [filter:drop-shadow(0_10px_22px_rgb(0_0_0/0.42))]"
            priority={size === "lg"}
            onError={() => setImgFailed(true)}
          />
        </div>
      </div>
    </div>
  );
}
